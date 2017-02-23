/* @flow */

import * as U from '../helpers/utils.js'

import type { Operation } from '../ot/types.js'

export type Edit = $Shape<{
  id: string,
  // keep source-uid here?

  operation: ?Operation,

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number,
}>

// The official edits on the server
export type ServerEdit = {|
  id?: string,
  operation?: Operation,

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number
|}

// Unsent operations on the client
export type BufferEdit = {|
  operation: ?Operation,
  childHash: string
|}

// Sent but unacknowledged operations on the client
export type OutstandingEdit = {|
  id: string,
  operation: ?Operation,
  parentHash: string,
  startIndex: number
|}

// Changes on the client that are sent to the server
export type UpdateEdit = {|
  id: string,
  operation: Operation, // never null!
  parentHash: string,
  startIndex: number
|}

export type EditsStack = {|
  operationsStack: Array<?Operation>, // oldest first
  parentHash: string
|}

export function castServerEdit(op: Edit, opts?: Object): ServerEdit {
  op = U.merge(op, opts)

  if (op.parentHash == null || op.childHash == null ||
      op.startIndex == null || op.nextIndex == null) {
    throw new Error('server op contains keys: ' + Object.keys(op).join(', '))
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

export function castOutstandingEdit(op: Edit, opts?: Object): OutstandingEdit {
  op = U.merge(op, opts)
  if (!('operation' in op) || op.id == null ||
      op.parentHash == null ||
      op.startIndex == null) {
    throw new Error('outstanding op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castUpdateEdit(op: Edit, opts?: Object): ?UpdateEdit {
  op = U.merge(op, opts)
  if (op.operation == null || op.id == null ||
      op.parentHash == null ||
      op.startIndex == null) {
    return undefined
  }
  return op
}
