/* @flow */

import { hash, clone, assign } from '../utils.js'

export type DeleteOperation = {
  kind: 'DeleteOperation',
  position: number,
  num: number
} & BaseOperation

export type InsertOperation = {
  kind: 'InsertOperation',
  position: number,
  text: string
} & BaseOperation

export type BaseOperation = {
  state: string,  // a hash representing the state this operation is applied to
  hash: string // a hash representing this operation (includes the state)
}

export type TextOperation = InsertOperation | DeleteOperation

export function generateDelete(position: number, num: number, state: string): DeleteOperation {
  return {
    kind: 'DeleteOperation',
    position: position,
    num: num,
    state: state,
    hash: 'del:' + position + ',' + num + '@' + state
  }
}

export function generateInsert(position: number, text: string, state: string): InsertOperation {
  return {
    kind: 'InsertOperation',
    position: position,
    text: text,
    state: state,
    hash: 'ins:' + position + ',' + hash(text) + '@' + state
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

export function transform(o1: TextOperation, o2: TextOperation): [TextOperation, TextOperation] {
  // transform (clientOp, serverOp) to (clientOpP, serverOpP) s.t.
  // apply(apply(text, clientOp), serverOpP) === apply(apply(text, serverOp, clientOpP))

  if (o1.position <= o2.position)
    return shift(o1, length(o2))

  if (o1.position > o2.position)
    return after(o1, o2)


  throw 'not implemented'
}

function shift <T> (operation: T & {position: number}, num: number): T {
  return assign(clone(operation), {position: operation.position + num})
}
