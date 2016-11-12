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

export type BaseSite = {
  uid: SiteUid,
  operationLog: Array<TextOperation>, // history of local operations, oldest to newest
  textHashToOperation: { [textHash: string]: TextOperation },
  requests: Array<[SiteUid, TextOperation]>, // [remote uid, remote op]
  text: string, // current state
}

export type Site = Server | Client

export function generateSite(): BaseSite {
  let operationLog = []
  let textHashToOperation = {}

  autoFill(operationLog, textHashToOperation, op => op.parentHash)

  return {
    uid: genUid(),
    operationLog: operationLog,
    textHashToOperation: textHashToOperation,
    requests: [],
    text: ''
  }
}

export function generateServer (): Server {
  return Object.assign({}, generateSite(), { kind: 'Server' })
}

export function generateClient (): Client {
  return Object.assign({}. generateSite(), { kind: 'Client' })
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

function applyLocalOperation(site: Site, op: TextOperation) {
  site.text = Operations.apply(site.text, op)
  site.operationLog.push(op)
}

function applyRequests(site: Site): Array<TextOperation> {
  // find the first remote op that is parented on a current operation

  while (true) {
    for (let [requestingSite, requestedOp] of site.requests]) {
      let currentHash = hash(site.text)

      while (requestedOp.parentHash !== currentHash) {
        sharedOp = site.textHashToOperation[requestedOp.parentHash]
        remoteOp = transformRemoteOperation(site, sharedOp, remoteOp)
      }
    }
    if (loggedOperation === undefined) { break }

    for (let loggedOp of site.operationLog) {
      if (loggedOp.parentHash === remoteOp.parentHash) {
      }
    }

    if (last(site.operationLog) && last(site.operationLog).parentHash !== remoteOp.parentHash) {
      throw 'wat'
    }

    site.text = Operations.apply(site.text, remoteOp)
    site.operationLog.push(remoteOp)

  }
  return []
}

export function applyRemoteOperation(site: Site, remoteOp: TextOperation): TextOperation {
  // store this request
  site.requests.push([site.uid, remoteOp])

  return remoteOp
}

export function applyInsert(site: Site, position: number, text: string): TextOperation {
  let op = Operations.generateInsert(position, text, hash(site.text))
  applyLocalOperation(site, op)
  return op
}

export function applyDelete(site: Site, position: number, num: number): TextOperation {
  let op = Operations.generateDelete(position, num, hash(site.text))
  applyLocalOperation(site, op)
  return op
}
