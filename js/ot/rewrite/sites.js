/* @flow */

import * as Operations from './operations'
import type { TextOperation } from './operations'
import { clone, assign, last, genUid, zipPairs, first, pop } from '../utils.js'
import { autoFill } from '../observe.js'
import { find, map, reject } from 'wu'

export type Server = {
  kind: 'Server'
} & BaseSite

export type Client = {
  kind: 'Client',
} & BaseSite

export type SiteUid = string
export type SiteState = string

export type BaseSite = {
  uid: SiteUid,

  log: Array<LogEntry>, // history of local operations, oldest to newest

  parentToOperationLog: { [parentState: SiteState]: ContextualOperation }, // mapping from the state it's executed on to the operation
  loggedOperationToParent: { [opUid: string]: SiteState }, // mapping from the op to the state it's executed on
  loggedOperationToResult: { [opUid: string]: SiteState }, // mapping from the op to the state that results from execution

  bridges: { [parentState: SiteState]: ContextualOperation }, // operations that take some parent state & transform it into a state in the log

  requests: Array<Request>, // pending requests

  text: string, // current state
  state: SiteState // uid for the current state
}

export type ContextualOperation = {
  operation: TextOperation,
  parentState: string,
  resultState: string
}

export type Request = {
  kind: 'Request',
  sourceSiteUid: SiteUid // where this request is from
} & ContextualOperation

export type LogEntry = {
  kind: 'LogEntry'
} & ContextualOperation

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
    text: '',
    state: 'start',
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

function composeContextualOperations(contextualOps: Array<ContextualOperation>)
: ContextualOperation {
  if (contextualOps.length === 0) { throw 'wat, no ops' }

  for (let [op1, op2] of zipPairs(contextualOps)()) {
    if (op1.resultState != op2.parentState) { throw 'wat, out of order' }
  }

  return {
    operation: Operations.composeMany(map(o => o.operation, contextualOps)),
    parentState: first(contextualOps).parentState,
    resultState: last(contextualOps).resultState
  }
}

function transformContextualOperations(
  site: Site,
  localOp: ContextualOperation,
  remoteOp: ContextualOperation
): [ ContextualOperation, ContextualOperation ] {
  // returns [localP, remoteP]
  // s.t. apply(apply(text, local), remoteP) === apply(apply(text, remote), localP)

  // they should be parented on the same state
  if (localOp.parentState !== remoteOp.parentState) { throw 'wat' }

  // they should diverge
  if (localOp.resultState === remoteOp.resultState) { throw 'wat, they do not diverge' }

  let [local, remote]: [TextOperation, TextOperation] = [localOp.operation, remoteOp.operation]
  let [localP, remoteP]: [TextOperation, TextOperation] = transformOperations(site, local, remote)

  // apply(apply(text, local), remoteP) === apply(apply(text, remote), localP)
  // therefore, remoteP is parented on local's result state
  //        and localP is parented on remote's result state

  // both remoteP and localP point at a completely new result state
  let newResult = genUid()

  return [
    {
      operation: localP,
      parentState: remoteOp.resultState,
      resultState: newResult
    },
    {
      operation: remoteP,
      parentState: localOp.resultState,
      resultState: newResult
    }
  ]
}

function bridgeContextualOperation(
  site: Site,
  remoteOp: ContextualOperation
): [ ContextualOperation, ContextualOperation ] {
  // returns [newRemoteOp, newBridgeOp]
  //   s.t. newRemoteOp is parented in the site's history

  // bridge to transform against
  let bridgeOp = site.bridges[remoteOp.parentState]

  // run the transformation
  let [bridgeOpP, remoteOpP]: [ContextualOperation, ContextualOperation]
      = transformContextualOperations(site, bridgeOp, remoteOp)

  // functionally, we've just generated a bridge (remote result => new result)
  // and a new operation (local result => new result)
  let [newBridgeOp, newRemoteOp] = [bridgeOpP, remoteOpP]

  // check our invariants
  if (newRemoteOp.parentState !== bridgeOp.resultState) {
    throw 'wat, the new op is in the wrong place'
  }

  if (newBridgeOp.parentState !== remoteOp.resultState) {
    throw 'wat, the bridge is in the wrong place'
  }

  return [newRemoteOp, newBridgeOp]
}

function historySince(site: Site, startParentState: string): Array<ContextualOperation> {
  let ops = []
  let parentState = startParentState

  while (true) {
    let nextOp: ContextualOperation = site.parentToOperationLog[parentState]
    if (nextOp == null) {
      break
    }

    ops.push(nextOp)
    parentState = nextOp.resultState
  }

  if (parentState != site.state) {
    throw 'wat history is incomplete'
  }

  return ops
}

function * applyRequests(site: Site): Generator<Request, void, void> {
  while (true) {
    let isInHistory = (state: SiteState) => state in site.parentToOperationLog
    let isHead = (state: SiteState) => state === site.state
    let isNew = (operation: ContextualOperation) =>
      (!isHead(operation.resultState) && !isInHistory(operation.resultState))
    let canImmediatelyApply = (operation: ContextualOperation) => isHead(operation.parentState)
    let canTransform = (operation: ContextualOperation) => isInHistory(operation.parentState)
    let canBridge = (operation: ContextualOperation) => operation.parentState in site.bridges

    let canApply = request => {
      return isNew(request)
          && (canImmediatelyApply(request) || canTransform(request) || canBridge(request))
    }

    // remove extra requests
    site.requests = Array.from(reject(request => !isNew(request), site.requests))

    // get the next applicable request
    let requestOp: ?Request = pop(site.requests, canApply)
    if (requestOp == null) { break }

    console.log('\nsite: ' + site.kind + ' #' + site.uid + ' @ ' + site.state + ' "' + site.text + '"')
    console.log('log: start, ' + Array.from(map(o => o.resultState, historySince(site, 'start'))).join(', '))
    console.log('bridges: ' + Object.keys(site.bridges).join(', '))
    console.log('  op is ' + requestOp.parentState + ' => ' + requestOp.resultState + ' from #' + requestOp.sourceSiteUid)
    console.log('  remaining: ' + Array.from(map(r => r.parentState + ' => ' + r.resultState, site.requests)).join(', '))

    let op: ContextualOperation = {
      parentState: requestOp.parentState,
      resultState: requestOp.resultState,
      operation: requestOp.operation
    }

    let bridge: ContextualOperation = { // bridge currently spans nothing
      parentState: requestOp.resultState,
      resultState: requestOp.resultState,
      operation: Operations.generateEmpty()
    }

    if (canBridge(op) && !canTransform(op) && !canImmediatelyApply(op)) {
      let [newOp, bridgeSegment] = bridgeContextualOperation(site, op)

      if (bridgeSegment.parentState !== requestOp.resultState) {
        throw 'wat, the new bridge is in the wrong place'
      }

      if (!canTransform(newOp) && !canImmediatelyApply(newOp)) {
        throw 'wat, the purpose of the bridge is to get back into the history'
      }

      bridge = composeContextualOperations([bridge, bridgeSegment])
      op = newOp
    }

    if (canTransform(op) && !canImmediatelyApply(op)) {
      // transform the request!
      let localOps: Array<ContextualOperation> = historySince(site, op.parentState)
      let localOp = composeContextualOperations(localOps)

      let [localOpP, opP] = transformContextualOperations(site, localOp, op)

      // functionally, we've just generated a bridge (remote result => new result)
      // and a new operation (local result => new result)
      let [bridgeSegment, newOp] = [localOpP, opP]

      if (newOp.parentState !== localOp.resultState) {
        throw 'wat, new operation is in the wrong place'
      }

      if (bridgeSegment.parentState !== op.resultState) {
        throw 'wat, bridge segment is in the wrong place'
      }

      if (bridgeSegment.resultState !== newOp.resultState) {
        throw 'wat, bridge & new op should match'
      }

      bridge = composeContextualOperations([bridge, bridgeSegment])
      op = newOp
    }

    // apply the new operation
    if (Operations.isEmpty(op.operation)) { continue }

    // check invariants
    if (!canImmediatelyApply(op)) { throw 'wat it should be applicable by now' }

    let newRequest: Request = applyOperation(site, op, requestOp.sourceSiteUid)
    let newResult = newRequest.resultState

    // save the bridge
    if (!Operations.isEmpty(bridge.operation)) {
      site.bridges[bridge.parentState] = {
        resultState: newResult,
        parentState: bridge.parentState,
        operation: bridge.operation
      }
    }

    console.log('\nfinishes #' + site.state + ' "' + site.text + '"\n')
    console.log('log: start, ' + Array.from(map(o => o.resultState, historySince(site, 'start'))).join(', '))

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

function applyOperation(site: Site, contextualOperation: ContextualOperation, sourceSiteUid: ?SiteUid): Request {
  if (sourceSiteUid == null) {
    sourceSiteUid = site.uid
  }

  // apply the operation
  let parentState = contextualOperation.parentState
  let resultState = contextualOperation.resultState
  if (parentState !== site.state) {
    throw 'wat operation should be parented on current state'
  }

  // run the operation
  let op = contextualOperation.operation
  site.text = Operations.apply(site.text, op)
  site.state = resultState

  // log applied operation
  let log = {
    kind: 'LogEntry',
    operation: op,
    parentState: parentState,
    resultState: resultState
  }
  site.log.push(log)

  // update data structures
  site.parentToOperationLog[parentState] = log
  site.loggedOperationToParent[op.uid] = parentState
  site.loggedOperationToResult[op.uid] = resultState

  // return request for other sites
  return {
    kind: 'Request',
    sourceSiteUid: sourceSiteUid,
    operation: op,
    parentState: parentState,
    resultState: resultState
  }
}

export function applyLocalInsert(site: Site, position: number, text: string): Request {
  let op = Operations.generateInsert(position, text)
  let request = applyOperation(site, {
    operation: op,
    parentState: site.state,
    resultState: genUid()
  })
  return request
}

export function applyLocalDelete(site: Site, position: number, num: number): Request {
  let op = Operations.generateDelete(position, num)
  let request = applyOperation(site, {
    operation: op,
    parentState: site.state,
    resultState: genUid()
  })
  return request
}
