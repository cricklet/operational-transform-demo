/* @flow */

import { genUid, assign, clone } from './utils.js'

import type{
  Priority
} from './priority.js'

import {
  generateInsertOperation,
  generateDeleteOperation,
  composeOperations,
  emptyTextOperation
} from './operations.js'

import type {
  InsertOperation,
  DeleteOperation,
  ComposedOperation,
  TextOperation
} from './operations.js'

export function transform(
  o1: TextOperation,
  o2: TextOperation,
  isHigherPriority: boolean
): [TextOperation, TextOperation] {
  // Given two operations, o1 & o2, generate two new operations
  // o1p & o2p such that: o2p(o1(...)) === o1p(o2(...))

  // Rather than have `transform` deal with the priorities of
  // o1 & o2, the caller should pass in whether o1 is higher priority
  // than o2.

  return [o1, o2]
}

function beforeInsert<T>(operation: T): T {
  return clone(o1)
}

function afterInsert<T>(operation: <T>): T {
  return assign(clone(o1), {position: o1.position + 1})
}

function beforeDelete<T>(operation: T): T {
  return clone(o1)
}

function afterDelete<T>(operation: <T>): T {
  return assign(clone(o1), {position: o1.position - 1})
}

export function transformInsertInsert(
  o1: InsertOperation,
  o2: InsertOperation,
  isHigherPriority: boolean
): TextOperation {
  // possible transformed operations
  let empty  = () => emptyTextOperation();
  let before = () => clone(o1);
  let after  = () => assign(clone(o1), {position: o1.position + 1})

  if (o1.character === o2.character && o1.position === o2.position)
    return empty()

  if (o1.position < o2.position)
    return before()

  if (o1.position > o2.position)
    return after()

  if (isHigherPriority)
    return after()

  if (!isHigherPriority)
    return before()

  throw "wat"
}

export function transformDeleteDelete(
  o1: DeleteOperation,
  o2: DeleteOperation,
  p1: Priority,
  p2: Priority
): TextOperation {
  // possible transformed operations
  let empty  = () => emptyTextOperation();
  let before = () => clone(o1);
  let after  = () => assign(clone(o1), {position: o1.position - 1})

  if (o1.character === o2.character && o1.position === o2.position)
    return empty()

  if (o1.position < o2.position)
    return before()

  if (o1.position > o2.position)
    return after()

  if (p1 > p2)
    return after()

  if (p1 < p2)
    return before()

  throw "wat"
}

export function transformInsertDelete(
  o1: InsertOperation,
  o2: DeleteOperation,
  p1: Priority,
  p2: Priority
): TextOperation {
  if (o1.position < o2.position)
    return clone(o1)

  if (o1.position >= o2.position)
    return assign(clone(o1), {position: o1.position - 1})

  throw "wat"
}

export function transformDeleteInsert(
  o1: DeleteOperation,
  o2: InsertOperation,
  p1: Priority,
  p2: Priority
): TextOperation {
  if (o1.position < o2.position)
    return clone(o1)

  if (o1.position >= o2.position)
    return assign(clone(o1), {position: o1.position + 1})

  throw "wat"
}
