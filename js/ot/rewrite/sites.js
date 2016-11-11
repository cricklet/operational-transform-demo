/* @flow */

import * as Operations from './operations'
import type { TextOperation } from './operations'
import { hash, clone, assign, last, genUid } from '../utils.js'
import { first } from 'wu.js'

export type Server = {
  kind: 'Server'
} & BaseSite


export type Client = {
  kind: 'Client',
} & BaseSite

export type SiteUid = string

export type BaseSite = {
  uid: SiteUid,
  log: Array<TextOperation>, // history of local operations, oldest to newest
  requests: Array<[SiteUid, TextOperation]>, // [remote uid, remote op]
  text: string, // current state
}

export type Site = Server | Client

export function generateServer () {
  return {
    kind: 'Server',
    uid: genUid(),
    log: [],
    requests: [],
    text: ''
  }
}

export function generateClient () {
  return {
    kind: 'Client',
    uid: genUid(),
    log: [],
    requests: [],
    text: ''
  }
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
  site.log.push(op)
}

function applyRequests(site: Site): Array<TextOperation> {

  // TODO
  while (true) {
    let logEntry = first([], site.log)
    if (logEntry === undefined) { break }

    let [remoteUid, remoteOp] = logEntry

    for (let loggedOp of site.log) {
      if (loggedOp.parentHash === remoteOp.parentHash) {
        remoteOp = transformRemoteOperation(site, loggedOp, remoteOp)
      }
    }

    if (last(site.log) && last(site.log).parentHash !== remoteOp.parentHash) {
      throw 'wat'
    }

    site.text = Operations.apply(site.text, remoteOp)
    site.log.push(remoteOp)

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
