/* @flow */

import * as Operations from './operations'
import type { TextOperation } from './operations'
import { hash, clone, assign, last, genUid, zipPairs, first } from '../utils.js'
import { autoFill } from '../observe.js'
import { find, map } from 'wu'

export type Server = {
  kind: 'Server'
} & BaseSite

export type Client = {
  kind: 'Client',
} & BaseSite

export type SiteUid = string
export type TextHash = string

export type BaseSite = {
  uid: SiteUid,

  log: Array<LogEntry>, // history of local operations, oldest to newest

  parentToOperationLog: { [parentHash: TextHash]: ActualizedOperation }, // mapping from the hash it's executed on to the operation
  loggedOperationToParent: { [opUid: string]: TextHash }, // mapping from the op to the hash it's executed on
  loggedOperationToResult: { [opUid: string]: TextHash }, // mapping from the op to the hash that results from execution

  bridges: { [parentHash: TextHash]: ActualizedOperation }, // operations that take some parent state & transform it into a state in the log

  requests: Array<Request>, // pending requests
  text: string, // current state
}

export type ActualizedOperation = {
  resultHash: string
} & ContextualOperation

export type ContextualOperation = {
  operation: TextOperation,
  parentHash: string
}

export type Request = {
  kind: 'Request',
  sourceSiteUid: SiteUid // where this request is from
} & ActualizedOperation

export type LogEntry = {
  kind: 'LogEntry'
} & ActualizedOperation

export type Site = Server | Client

function generateSite(): BaseSite {
  let log = []

  return {
    uid: genUid(),
    log: log,
    parentToOperationLog: {},
    loggedOperationToParent: {},
    loggedOperationToResult: {},
    operationToTransform: {},
    requests: [],
    bridges: {},
    text: ''
  }
}

export function generateServer (): Server {
  return Object.assign({}, generateSite(), { kind: 'Server' })
}

export function generateClient (): Client {
  return Object.assign({}, generateSite(), { kind: 'Client' })
}

function transformOperations(
  site: Site,
  localOp: TextOperation,
  remoteOp: TextOperation
): [TextOperation, TextOperation] {
  if (site.kind === 'Client') {
    let [localOpT, remoteOpT] = Operations.transform(localOp, remoteOp)
    return [localOpT, remoteOpT]
  }
  if (site.kind === 'Server') {
    let [remoteOpT, localOpT] = Operations.transform(remoteOp, localOp)
    return [localOpT, remoteOpT]
  }
  throw 'wat'
}

function composeActualizedOperations(contextualOps: Array<ActualizedOperation>)
: ActualizedOperation {
  if (contextualOps.length === 0) { throw 'wat, no ops' }

  for (let [op1, op2] of zipPairs(contextualOps)()) {
    if (op1.resultHash != op2.parentHash) { throw 'wat, out of order' }
  }

  return {
    operation: Operations.composeMany(map(o => o.operation, contextualOps)),
    parentHash: first(contextualOps).parentHash,
    resultHash: last(contextualOps).resultHash
  }
}

function composeContextualOperations(contextualOps: Array<ContextualOperation>)
: ContextualOperation {
  return {
    operation: Operations.composeMany(map(o => o.operation, contextualOps)),
    parentHash: first(contextualOps).parentHash
  }
}

function transformActualizedOperations(
  site: Site,
  localOp: ActualizedOperation,
  remoteOp: ActualizedOperation
): [ ContextualOperation, ContextualOperation ] {
  // returns [localP, remoteP]
  // s.t. apply(apply(text, local), remoteP) === apply(apply(text, remote), localP)

  // they should be parented on the same state
  if (localOp.parentHash !== remoteOp.parentHash) { throw 'wat' }

  let [local, remote]: [TextOperation, TextOperation] = [localOp.operation, remoteOp.operation]
  let [localP, remoteP]: [TextOperation, TextOperation] = transformOperations(site, local, remote)

  // apply(apply(text, local), remoteP) === apply(apply(text, remote), localP)
  // therefore, remoteP is parented on local's result hash
  //        and localP is parented on remote's result hash

  return [
    {
      operation: localP,
      parentHash: remoteOp.resultHash
    },
    {
      operation: remoteP,
      parentHash: localOp.resultHash
    }
  ]
}

function bridgeContextualOperations(
  site: Site,
  remoteOp: ContextualOperation
): [ ContextualOperation, ContextualOperation ] {
  // returns [newRemoteOp, newBridgeOp]
  //   s.t. newRemoteOp is parented in the site's history

  // no need to bridge if we're in history
  if (isParentedInHistory(site, remoteOp)) { throw 'wat' }

  // bridge to transform against
  let bridgeOp = site.bridges[remoteOp.parentHash]

  // run the transformation
  let [bridgeOpP, remoteOpP]: [ContextualOperation, ContextualOperation]
      = transformActualizedOperations(site, bridgeOp, remoteOp)

  // functionally, we've just generated a bridge (remote result => new result)
  // and a new operation (local result => new result)
  let [newBridgeOp, newRemoteOp] = [bridgeOpP, remoteOpP]

  // check our invariants
  if (!isParentedInHistory(site, newRemoteOp)) {
    throw 'wat, the purpose of the bridge is to get back into the history'
  }

  if (newRemoteOp.parentHash !== bridgeOp.resultHash) {
    throw 'wat, the new op is in the wrong place'
  }

  return [newRemoteOp, newBridgeOp]
}

function historySince(site: Site, startParentHash: string): Array<ActualizedOperation> {
  let ops = []
  let parentHash = startParentHash

  while (true) {
    let nextOp: ActualizedOperation = site.parentToOperationLog[parentHash]
    if (nextOp == null) {
      break
    }

    ops.push(nextOp)
    parentHash = nextOp.resultHash
  }

  if (parentHash != hash(site.text)) {
    throw 'wat history is incomplete'
  }

  return ops
}

function isImmediatelyApplicable(site: Site, operation: ContextualOperation) {
  return hash(site.text) === operation.parentHash
}

function isParentedInHistory(site: Site, operation: ContextualOperation) {
  return operation.parentHash in site.parentToOperationLog
}

function isBridgeable(site: Site, operation: ContextualOperation) {
  return operation.parentHash in site.bridges && !isParentedInHistory(site, operation)
}

function isApplicable(site: Site, operation: ContextualOperation) {
  return isImmediatelyApplicable(site, operation) || isParentedInHistory(site, operation) || isBridgeable(site, operation)
}

function * applyRequests(site: Site): Generator<Request, void, void> {
  while (true) {
    let requestOp: ?Request = find(request => isApplicable(site, request), site.requests)
    if (requestOp == null) { break }

    // pop this request off the queue
    site.requests.pop(requestOp)

    let op: ContextualOperation = {
      parentHash: requestOp.parentHash,
      operation: requestOp.operation
    }

    let bridge: ContextualOperation = {
      parentHash: requestOp.resultHash,
      operation: Operations.generateEmpty()
    }

    if (isBridgeable(site, op)) {
      let [newOp, bridgeSegment] = bridgeContextualOperations(site, op)

      if (bridgeSegment.parentHash !== requestOp.resultHash) {
        throw 'wat, the new bridge is in the wrong place'
      }

      bridge = composeContextualOperations([bridge, bridgeSegment])
      op = newOp
    }

    if (isParentedInHistory(site, op)) {
      // transform the request!
      let localOps: Array<ActualizedOperation> = historySince(site, op.parentHash)
      let localOp = composeActualizedOperations(localOps)

      let [localOpP, opP] = transformActualizedOperations(site, localOp, op)

      // functionally, we've just generated a bridge (remote result => new result)
      // and a new operation (local result => new result)
      let [bridgeSegment, newOp] = [localOpP, opP]

      if (newOp.parentHash === localOp.resultHash) {
        throw 'wat, new operation is in the wrong place'
      }

      bridge = composeContextualOperations([bridge, bridgeSegment])
      op = newOp
    }

    // apply the new operation
    debugger
    let newRequest: Request = applyOperation(site, op, requestOp.sourceSiteUid)
    let newResult = newRequest.resultHash

    // save the bridge
    if (!Operations.isEmpty(bridge.operation)) {
      site.bridges[bridge.parentHash] = {
        resultHash: newResult,
        parentHash: bridge.parentHash,
        operation: bridge.operation
      }
    }

    // yield the request that should be sent to other clients
    yield newRequest
  }
}

export function applyRequest(site: Site, request: Request): Array<Request> {
  if (site.uid === request.sourceSiteUid) {
    return [] // no need to apply requests on originating site
  }

  // store this request
  site.requests.push(request)

  // apply all possible requests
  return Array.from(applyRequests(site))
}

function applyOperation(site: Site, contextualOp: ContextualOperation, sourceSiteUid: ?SiteUid): Request {
  if (sourceSiteUid == null) {
    sourceSiteUid = site.uid
  }

  // apply the operation
  let parentHash = hash(site.text)
  if (contextualOp.parentHash !== parentHash) {
    debugger
    throw 'wat parent hashes differ'
  }

  let op = contextualOp.operation
  site.text = Operations.apply(site.text, op)
  let resultHash = hash(site.text)

  // log operation to apply
  let log = {
    kind: 'LogEntry',
    operation: op,
    parentHash: parentHash,
    resultHash: resultHash
  }

  site.log.push(log)
  site.parentToOperationLog[parentHash] = log
  site.loggedOperationToParent[op.uid] = parentHash
  site.loggedOperationToResult[op.uid] = resultHash

  // return request for other sites
  return {
    kind: 'Request',
    sourceSiteUid: sourceSiteUid,
    operation: op,
    parentHash: parentHash,
    resultHash: resultHash
  }
}

export function applyLocalInsert(site: Site, position: number, text: string): Request {
  let parentHash = hash(site.text)
  let op = Operations.generateInsert(position, text, parentHash)
  let request = applyOperation(site, { operation: op, parentHash: parentHash })
  return request
}

export function applyLocalDelete(site: Site, position: number, num: number): Request {
  let parentHash = hash(site.text)
  let op = Operations.generateDelete(position, num, parentHash)
  let request = applyOperation(site, { operation: op, parentHash: parentHash })
  return request
}
