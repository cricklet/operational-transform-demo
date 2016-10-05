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

export type NullOperation = {
  kind: 'NullOperation',
} & Operation

export type ComposedOperation<TOperation> = {
  kind: 'ComposedOperation',
  operations: Array<TOperation>
} & Operation

export type TextOperation = DeleteOperation | InsertOperation | NullOperation | ComposedOperation<TextOperation>

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

export function composeOperations<TOperation>(... operations: Array<TOperation>): ComposedOperation<TOperation> {
  return {
    uid: genUid(),
    operations: operations,
    kind: 'ComposedOperation',
  }
}

export function nullTextOperation(): TextOperation {
  return {
    uid: genUid(),
    kind: 'NullOperation'
  }
}

export function performTextOperation(text: string, operation: TextOperation): string {
  if (operation.kind === 'DeleteOperation') {
    let deleteOp: DeleteOperation = operation;
    if (deleteOp.position < 0 || deleteOp.position >= text.length) {
      throw "Cannot delete character at " + deleteOp.position + " from string of length " + text.length;
    }
    return text.substring(0, deleteOp.position) + text.substring(deleteOp.position + 1)
  }

  if (operation.kind === 'InsertOperation') {
    let insertOp: InsertOperation = operation;
    if (insertOp.position < 0 || insertOp.position > text.length) {
      throw "Cannot delete character at " + insertOp.position + " from string of length " + text.length;
    }
    return text.substring(0, insertOp.position) + insertOp.character + text.substring(insertOp.position)
  }

  if (operation.kind === 'ComposedOperation') {
    let composedOp: ComposedOperation<TextOperation> = operation;
    let transformedText = text;
    for (let innerOp of composedOp.operations) {
      transformedText = performTextOperation(transformedText, innerOp)
    }
    return transformedText;
  }

  if (operation.kind === 'NullOperation') {
    return text;
  }

  throw ("Unknown operation: " + operation)
}
