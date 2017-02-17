/* @flow */

import * as U from '../helpers/utils.js'

import type { Operation } from '../ot/types.js'

export type ServerUpdatePacket = {
  kind: 'ServerUpdatePacket',
  sourceUid: string,
  docId: string,
  edit: ServerEdit
}

export type ClientUpdatePacket = {
  kind: 'ClientUpdatePacket',
  sourceUid: string,
  docId: string,
  edit: PrebufferEdit
}

export type Edit = $Shape<{
  id: string,

  operation: ?Operation,

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number,
}>

export type ServerEdit = {
  id: string,

  operation: ?Operation,

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number
}

export type AppliedEdit = {
  operation: ?Operation,
  parentHash: string,
  childHash: string,
}

export type BufferEdit = {
  operation: ?Operation,
  childHash: string
}

export type PrebufferEdit = {
  id: string,
  operation: ?Operation,
  parentHash: string,
  startIndex: number
}

export type EditsStack = {
  operationsStack: Array<?Operation>, // oldest first
  parentHash: string
}

export function castServerEdit(op: Edit, opts?: Object): ServerEdit {
  op = U.merge(op, opts)
  if (!('operation' in op) || op.id == null ||
      op.parentHash == null || op.childHash == null ||
      op.startIndex == null || op.nextIndex == null) {
    throw new Error('server op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castAppliedEdit(op: Edit, opts?: Object): AppliedEdit {
  op = U.merge(op, opts)
  if (!('operation' in op) || op.childHash == null || op.parentHash == null) {
    throw new Error('applied contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castBufferEdit(op: Edit, opts?: Object): BufferEdit {
  op = U.merge(op, opts)
  if (!('operation' in op) || op.childHash == null) {
    throw new Error('buffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castPrebufferEdit(op: Edit, opts?: Object): PrebufferEdit {
  op = U.merge(op, opts)
  if (!('operation' in op) || op.id == null ||
      op.parentHash == null ||
      op.startIndex == null) {
    throw new Error('prebuffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}
