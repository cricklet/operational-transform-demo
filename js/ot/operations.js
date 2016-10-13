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

export function inferOperations(oldText: string, newText: string): Array<TextOperation> {
  if (oldText.length === newText.length) {
    // either we have a no-op
    if (oldText === newText) {
      return [];
    }
  }

  if (newText.length === 0) {
    return Array.from(repeat(
      oldText.length,
      (i) => generateDeleteOperation(0)))
  }

  if (oldText.length === 0) {
    return Array.from(repeat(
      newText.length,
      (i) => generateInsertOperation(i, newText[i])))
  }

  // or we have a selection being overwritten. this is well tested!
  let endOffset = lastDifference(oldText, newText)
  let startOffset = firstDifference(oldText, newText)

  let start = startOffset
  let endOld = oldText.length - endOffset
  let endNew = newText.length - endOffset
  console.log(oldText)
  console.log(newText)
  console.log(startOffset, endOffset)

  let deletes: Array<TextOperation> = Array.from(
    repeat(
      endOld - start,
      (i) => generateDeleteOperation(start)))

  let inserts: Array<TextOperation> = Array.from(
    repeat(
      endNew - start,
      (i) => {
        console.log('insert', i)
        let index = start + i
        return generateInsertOperation(index, newText[index])
      }))

  return concat(deletes, inserts)
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

export function performOperations(
  originalText: string,
  operations: Array<TextOperation>
): string {
  let text = originalText
  for (let op of operations) {
    text = performTextOperation(text, op)
  }
  return text
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
