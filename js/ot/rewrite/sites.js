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

  let parentToOperationLog = {}
  let loggedOperationToParent = {}
  let loggedOperationToResult = {}

  autoFill(log, parentToOperationLog, log => log.parentHash, log => log)
  autoFill(log, loggedOperationToParent, log => log.uid, log => log.parentHash)
  autoFill(log, loggedOperationToResult, log => log.uid, log => log.resultHash)

  return {
    uid: genUid(),
    log: log,
    parentToOperationLog: parentToOperationLog,
    loggedOperationToParent: loggedOperationToParent,
    loggedOperationToResult: loggedOperationToResult,
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

function transformActualizedOperations(
  site: Site,
  localOp: ActualizedOperation,
  remoteOp: ActualizedOperation
): [ ContextualOperation, ContextualOperation ] {
  // they should be parented on the same state
  if (localOp.parentHash !== remoteOp.parentHash) { throw 'wat' }

  // and they should diverge
  if (localOp.resultHash === remoteOp.resultHash) { throw 'wat' }

  let [local, remote]: [TextOperation, TextOperation] = [localOp.operation, remoteOp.operation]
  let [localP, remoteP]: [TextOperation, TextOperation] = transformOperations(site, local, remote)

  // apply(apply(text, local), remoteP) === apply(apply(text, remote), localP)
  // therefore, remoteP is parented on local's result hash
  //        and localP is parented on remote's result hash

  return [
    {
      operation: localP,
      parentHash: remoteOp.parentHash
    },
    {
      operation: remoteP,
      parentHash: localOp.parentHash
    }
  ]
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

function isParentedInHistory(site: Site, operation: ContextualOperation) {
  return operation.parentHash in site.parentToOperationLog
}

function isBridgeable(site: Site, operation: ContextualOperation) {
  return operation.parentHash in site.bridges
}

function isApplicable(site: Site, operation: ContextualOperation) {
  return isParentedInHistory(site, operation) || isBridgeable(site, operation)
}

function * applyRequests(site: Site): Generator<Request, void, void> {
  while (true) {
    let requestOp: ?Request = find(
      request => isApplicable(site, request),
      site.requests)
    if (requestOp == null) { break }

    // pop this request off the queue
    site.requests.pop(requestOp)

    let requestParent = requestOp.parentHash
    let requestResult = requestOp.resultHash

    // transform the request!
    let historyOps: Array<ActualizedOperation> = historySince(site, requestParent)
    let historyOp = composeActualizedOperations(historyOps)
    let oldResult = historyOp.resultHash

    let [historyOpP, requestOpP] = transformActualizedOperations(site, historyOp, requestOp)

    // functionally, we've just generated a bridge (requestResult => newResult)
    // and a new operation (oldResult => newResult)
    let [bridgeOp, newOp] = [historyOpP, requestOpP]

    // apply the new operation
    let newRequest: Request = applyOperation(site, newOp)
    let newResult = newRequest.resultHash

    // save the bridge
    site.bridges[historyOpP.parentHash] = {
      resultHash: newResult,
      parentHash: bridgeOp.parentHash,
      operation: bridgeOp.operation
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

function applyOperation(site: Site, contextualOp: ContextualOperation): Request {
  // apply the operation
  let parentHash = hash(site.text)
  if (contextualOp.parentHash !== parentHash) { throw 'wat' }

  let op = contextualOp.operation
  site.text = Operations.apply(site.text, op)
  let resultHash = hash(site.text)

  // log operation to apply
  site.log.push({
    kind: 'LogEntry',
    operation: op,
    parentHash: parentHash,
    resultHash: resultHash
  })

  // return request for other sites
  return {
    kind: 'Request',
    sourceSiteUid: site.uid,
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
