/* @flow */

import * as U from '../helpers/utils.js'

import type { OpComponent } from '../operations/components.js'

export type ServerUpdate = {
  kind: 'ServerUpdate',
  sourceUid: string,
  docId: string,
  operation: ServerOperation
}

export type ClientUpdate = {
  kind: 'ClientUpdate',
  sourceUid: string,
  docId: string,
  operation: PrebufferOperation
}

export type Operation = $Shape<{
  id: string,

  ops: ?OpComponent[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number,
}>

export type ServerOperation = {
  id: string,

  ops: ?OpComponent[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number
}

export type AppliedOperation = {
  ops: ?OpComponent[],
  parentHash: string,
  childHash: string,
}

export type BufferOperation = {
  ops: ?OpComponent[],
  childHash: string
}

export type PrebufferOperation = {
  id: string,
  ops: ?OpComponent[],
  parentHash: string,
  startIndex: number
}

export type OperationsStack = {
  opsStack: Array<?OpComponent[]>, // oldest first
  parentHash: string
}

export function castServerOp(op: Operation, opts?: Object): ServerOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.id == null ||
      op.parentHash == null || op.childHash == null ||
      op.startIndex == null || op.nextIndex == null) {
    throw new Error('server op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castAppliedOp(op: Operation, opts?: Object): AppliedOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.childHash == null || op.parentHash == null) {
    throw new Error('applied contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castBufferOp(op: Operation, opts?: Object): BufferOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.childHash == null) {
    throw new Error('buffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castPrebufferOp(op: Operation, opts?: Object): PrebufferOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.id == null ||
      op.parentHash == null ||
      op.startIndex == null) {
    throw new Error('prebuffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}
