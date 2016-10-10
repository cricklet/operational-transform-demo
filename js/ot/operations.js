/* @flow */

import { genUid, firstDifference, lastDifference, repeat, concat } from './utils.js'

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

export type TextOperation = DeleteOperation | InsertOperation | NullOperation

export type Operation = {
  uid: string
}

export function generateOperation(oldText: string, newText: string): Array<TextOperation> {
  if (oldText.length === newText.length) {
    // either we have a no-op
    if (oldText === newText) {
      return [nullTextOperation()];
    }
    // or we have a selection being overwritten
    let start = firstDifference(oldText, newText)
    let end = lastDifference(oldText, newText)

    let deletes: Array<TextOperation> = Array.from(
      repeat(
        end - start + 1,
        (i) => generateDeleteOperation(start)))

    let inserts: Array<TextOperation> = Array.from(
      repeat(
        end - start + 1,
        (i) => {
          let index = start + i
          return generateInsertOperation(index, newText[index])
        }))

    return concat(deletes, inserts)
  }

  throw 'wat'
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

  if (operation.kind === 'NullOperation') {
    return text;
  }

  throw ("Unknown operation: " + operation)
}
