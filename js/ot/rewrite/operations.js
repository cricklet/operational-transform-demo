/* @flow */

import { hash, clone, assign, genUid } from '../utils.js'

export type DeleteOperation = {
  kind: 'DeleteOperation',
  position: number,
  num: number,
  uid: string
}

export type InsertOperation = {
  kind: 'InsertOperation',
  position: number,
  text: string,
  uid: string
}

export type TextOperation = InsertOperation | DeleteOperation

export function generateDelete(position: number, num: number): DeleteOperation {
  return {
    kind: 'DeleteOperation',
    position: position,
    num: num,
    uid: genUid()
  }
}

export function generateInsert(position: number, text: string): InsertOperation {
  return {
    kind: 'InsertOperation',
    position: position,
    text: text,
    uid: genUid()
  }
}

export function apply(text: string, op: TextOperation): string {
  if (op.kind === 'InsertOperation') {
    if (op.position < 0 || op.position > text.length) {
      throw 'out of bounds'
    }

    return text.slice(0, op.position) + op.text + text.slice(op.position)
  }
  if (op.kind === 'DeleteOperation') {
    if (op.position + op.num > text.length || op.position < 0) {
      throw 'out of bounds'
    }

    return text.slice(0, op.position) + text.slice(op.position + op.num)
  }

  return text
}

function shift <T> (operation: T & {position: number}, num: number): T {
  return assign(clone(operation), {position: operation.position + num})
}

function adjustment (operation: TextOperation): number {
  if (operation.kind === 'InsertOperation') {
    return operation.text.length
  }
  if (operation.kind === 'DeleteOperation') {
    return - operation.num
  }
  throw 'wat'
}

export function transform(clientOp: TextOperation, serverOp: TextOperation): [TextOperation, TextOperation] {
  // transform (clientOp, serverOp) to (clientOpP, serverOpP) s.t.
  // apply(apply(text, clientOp), serverOpP) === apply(apply(text, serverOp, clientOpP))
  let o1 = clientOp
  let o2 = serverOp

  if (o1.position <= o2.position) {
    return [shift(o1, adjustment(o2)), o2]
  }
  if (o1.position > o2.position) {
    return [o1, shift(o2, adjustment(o1))]
  }
  if (o1.position === o2.position) { // always prioritize o2 (the server op)
    return [shift(o1, adjustment(o2)), o2]
  }
  throw 'not implemented'
}
