/* @flow */

import {
  genUid,
  assign,
  clone,
  Greater,
  Equal,
  Less
} from './utils.js'

import type {
  Comparison
} from './utils.js'

import {
  Greater,
  Less,
  Equal
} from './utils.js'

import type {
  Priority
} from './sites.js'

import {
  generateInsertOperation,
  generateDeleteOperation,
  nullTextOperation
} from './operations.js'

import type {
  InsertOperation,
  DeleteOperation,
  TextOperation
} from './operations.js'

export function transformPair(
  o1: TextOperation,
  o2: TextOperation,
  priority: Comparison
): [TextOperation, TextOperation] {
  // Given two operations, o1 & o2, generate two new operations
  // o1p & o2p such that: o2p(o1(...)) === o1p(o2(...))

  // Rather than have `transform` deal with the priorities of
  // o1 & o2, the caller should pass in whether o1 is higher priority
  // than o2.

  return [
    transform(o1, o2, priority),
    transform(o1, o2, - priority)
  ]
}

export function transform(
  o1: TextOperation,
  o2: TextOperation,
  priority: Comparison
): TextOperation {
  if (o1.kind === "InsertOperation") {
    if (o2.kind === "InsertOperation") {
      return transformInsertInsert(o1, o2, priority)
    }
    if (o2.kind === "DeleteOperation") {
      return transformInsertDelete(o1, o2)
    }
  }
  if (o1.kind === "DeleteOperation") {
    if (o2.kind === "InsertOperation") {
      return transformDeleteInsert(o1, o2)
    }
    if (o2.kind === "DeleteOperation") {
      return transformDeleteDelete(o1, o2)
    }
  }

  throw "wat"
}

function before<T>(operation: T & {position: number}, otherOperation: TextOperation): T {
  // Transform 'operation' so that it can be executed before 'otherOperation'.
  // (This transformation does nothing)
  return clone(operation)
}

function after<T>(operation: T & {position: number}, otherOperation: TextOperation): T {
  // Transform 'operation' so that it can be executed after 'otherOperation'.
  if (otherOperation.kind === "InsertOperation") {
    return assign(clone(operation), {position: operation.position + 1})
  }
  if (otherOperation.kind === "DeleteOperation") {
    return assign(clone(operation), {position: operation.position - 1})
  }
  throw "wat"
}

export function transformInsertInsert(
  o1: InsertOperation,
  o2: InsertOperation,
  priority: Comparison
): TextOperation {
  if (o1.character === o2.character && o1.position === o2.position)
    return nullTextOperation()

  if (o1.position < o2.position)
    return before(o1, o2)

  if (o1.position > o2.position)
    return after(o1, o2)

  if (priority === Greater)
    return after(o1, o2)

  if (priority === Less)
    return before(o1, o2)

  throw "wat"
}

export function transformDeleteDelete(
  o1: DeleteOperation,
  o2: DeleteOperation
): TextOperation {
  if (o1.position === o2.position)
    return nullTextOperation()

  if (o1.position < o2.position)
    return before(o1, o2)

  if (o1.position > o2.position)
    return after(o1, o2)

  throw "wat"
}

export function transformInsertDelete(
  o1: InsertOperation,
  o2: DeleteOperation
): TextOperation {
  if (o1.position <= o2.position)
    return before(o1, o2)

  if (o1.position > o2.position)
    return after(o1, o2)

  throw "wat"
}

export function transformDeleteInsert(
  o1: DeleteOperation,
  o2: InsertOperation
): TextOperation {
  if (o1.position < o2.position)
    return clone(o1)

  if (o1.position >= o2.position)
    return after(o1, o2)

  throw "wat"
}
