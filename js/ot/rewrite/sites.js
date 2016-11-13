/* @flow */

import * as Operations from './operations'
import type { TextOperation } from './operations'
import { hash, clone, assign, last, genUid } from '../utils.js'
import { autoFill } from '../observe.js'
import { find } from 'wu'

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

  operationLog: Array<LogEntry>, // history of local operations, oldest to newest

  parentHashToOperation: { [parentHash: TextHash]: TextOperation }, // mapping from the hash it's executed on to the operation
  resultHashToOperation: { [resultHash: TextHash]: TextOperation }, // mapping from the resulting hash to the operation
  operationUidToParentHash: { [opUid: string]: TextHash }, // mapping from the op to the hash it's executed on
  operationUidToResultHash: { [opUid: string]: TextHash }, // mapping from the op to the hash that results from execution

  requests: Array<Request>, // pending requests
  text: string, // current state

  // requestsExecutedFrom: {
  //   [siteUid: SiteUid]: number // how many operations from some site have been executed here?
  // }
}

export type Request = {
  sourceSiteUid: SiteUid, // where this request is from
  operation: TextOperation, // what operation was executed
  parentHash: string, // what the state of the text was when the op executed
  // requestNumber: number // what number request is this from this site?
}

export type LogEntry = {
  operation: TextOperation, // what operation was executed
  parentHash: string, // what the state of the text was when the op executed
  resultHash: string // what the state of the text is after the op is executed
}

export type Site = Server | Client

function generateSite(): BaseSite {
  let operationLog = []

  let parentHashToOperation = {}
  let resultHashToOperation = {}
  let operationUidToParentHash = {}
  let operationUidToResultHash = {}

  autoFill(operationLog, parentHashToOperation, log => log.parentHash)
  autoFill(operationLog, resultHashToOperation, log => log.resultHash)
  autoFill(operationLog, operationUidToParentHash, log => log.uid, log => log.parentHash)
  autoFill(operationLog, operationUidToResultHash, log => log.uid, log => log.resultHash)

  return {
    uid: genUid(),
    operationLog: operationLog,
    parentHashToOperation: parentHashToOperation,
    resultHashToOperation: resultHashToOperation,
    operationUidToParentHash: operationUidToParentHash,
    operationUidToResultHash: operationUidToResultHash,
    requests: [],
    text: ''
  }
}

export function generateServer (): Server {
  return Object.assign({}, generateSite(), { kind: 'Server' })
}

export function generateClient (): Client {
  return Object.assign({}, generateSite(), { kind: 'Client' })
}

function transformRemoteOperation(site: Site, localOp: TextOperation, remoteOp: TextOperation): TextOperation {
  if (site.kind === 'Client') {
    let [loggedOpT, remoteOpT] = Operations.transform(localOp, remoteOp)
    return remoteOpT
  }
  if (site.kind === 'Server') {
    let [remoteOpT, loggedOpT] = Operations.transform(remoteOp, localOp)
    return remoteOpT
  }
  throw 'wat'
}

function requestIsTransformable(site: Site, request: Request): boolean {
  let remoteParentHash: TextHash = request.parentHash
  return remoteParentHash in site.parentHashToOperation
      || remoteParentHash === hash(site.text)
}

function transformRequest(site: Site, request: Request)
: ?Request { // return a request that can be immediately applied
  let remoteSiteUid: SiteUid = request.sourceSiteUid
  let remoteOp: TextOperation = request.operation
  let remoteParentHash: TextHash = request.parentHash

  let currentHash: TextHash = hash(site.text)

  // flag for debugging
  let transformed = false

  while (remoteParentHash !== currentHash) {
    // grab the local operation that shares the same parent hash as
    // the remote operation
    let sharedOp: TextOperation = site.parentHashToOperation[remoteParentHash]
    if (sharedOp === undefined) { break }

    let sharedParentHash: TextHash = site.operationUidToParentHash[sharedOp.uid]
    let sharedResultHash: TextHash = site.operationUidToResultHash[sharedOp.uid]

    if (sharedParentHash !== remoteParentHash) { throw 'wat' }

    // run the transformation! this makes the remote operation parented on
    // the result of the shared operation
    remoteOp = transformRemoteOperation(site, sharedOp, remoteOp)
    remoteParentHash = sharedResultHash

    transformed = true
  }

  // make sure transformation was complete
  if (transformed && remoteParentHash !== currentHash) { throw 'wat' }

  if (remoteParentHash === currentHash) {
    // this transformed request is easy to apply!
    return {
      sourceSiteUid: request.sourceSiteUid,
      operation: remoteOp,
      parentHash: remoteParentHash
    }
  } else {
    return undefined
  }
}

function * applyRequests(site: Site): Generator<Request, void, void> {
  while (true) {
    let request: ?Request = find(request => requestIsTransformable(site, request), site.requests)
    if (request == null) { break }

    // pop this request off the queue
    site.requests.pop(request)

    // transform the request!
    let transformedRequest: ?Request = transformRequest(site, request)
    if (transformedRequest == null) { throw 'wat' }

    // apply this request!
    applyOperation(site, transformedRequest.operation)

    yield transformedRequest
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

function applyOperation(site: Site, op: TextOperation): Request {
  // apply the operation
  let parentHash = hash(site.text)
  site.text = Operations.apply(site.text, op)
  let resultHash = hash(site.text)

  // log operation to apply
  site.operationLog.push({
    operation: op,
    parentHash: parentHash,
    resultHash: resultHash
  })

  // return request for other sites
  return {
    sourceSiteUid: site.uid,
    operation: op,
    parentHash: parentHash
  }
}

export function applyLocalInsert(site: Site, position: number, text: string): Request {
  let op = Operations.generateInsert(position, text, hash(site.text))
  let request = applyOperation(site, op)
  return request
}

export function applyLocalDelete(site: Site, position: number, num: number): Request {
  let op = Operations.generateDelete(position, num, hash(site.text))
  let request = applyOperation(site, op)
  return request
}
