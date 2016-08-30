/* @flow */

import { genUid } from './utils.js'

export type DeleteOperation = {
  kind: 'DeleteOperation',
  position: number,
} & Operation

export type InsertOperation = {
  kind: 'InsertOperation',
  position: number,
  character: string,
} & Operation

export type TextOperation = DeleteOperation | InsertOperation

export type Operation = {
  uid: string
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

  if (operation.kind === 'InsertOperation') {
    let insertOp: InsertOperation = operation;
    return text.substring(0, insertOp.position) + insertOp.character + text.substring(insertOp.position)
  }

  throw ("Unknown operation: " + operation)
}
