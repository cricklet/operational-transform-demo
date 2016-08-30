/* @flow */

import { genUid } from './utils.js'

export type DeleteOperation = {
  kind: 'DeleteOperation',
  position: number,
} & TextOperation

export type InsertOperation = {
  kind: 'InsertOperation',
  position: number,
  character: string,
} & TextOperation

export type TextOperation = Operation

export type Operation = {
  uid: string,
  kind: string
}

export function generateDeleteOperation(position: number): DeleteOperation {
  return {
    uid: genUid(),
    position: position,
    kind: 'DeleteOperation',
  }
}

export function generateInsertOperation(position: number, character: string): InsertOperation {
  if (character.length != 1) {
    throw "Bad character: '" + character + "'"
  }
  return {
    uid: genUid(),
    position: position,
    character: character,
    kind: 'InsertOperation',
  }
}

export function performTextOperation(text: string, operation: TextOperation): string {
  if (operation.kind === 'DeleteOperation') {
    let deleteOp: DeleteOperation = operation;
    return text.substring(0, deleteOp.position) + text.substring(deleteOp.position + 1)
  }
  else if (operation.kind === 'InsertOperation') {
    let insertOp: InsertOperation = operation;
    return text.substring(0, insertOp.position) + insertOp.character + text.substring(insertOp.position)
  }

  throw "Unknown operation: " + operation
}
