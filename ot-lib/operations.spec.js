"use strict"

import * as assert from 'assert'

import {
  generateDeleteOperation,
  generateInsertOperation,
  composeOperations,
  performTextOperation
} from './operations'

describe('performTextOperation()', () => {
  [
    { text: '0123', op: generateInsertOperation(-1, 'a'), throws: true },
    { text: '0123', op: generateInsertOperation(0, 'a'), result: 'a0123' },
    { text: '0123', op: generateInsertOperation(1, 'a'), result: '0a123' },
    { text: '0123', op: generateInsertOperation(2, 'a'), result: '01a23' },
    { text: '0123', op: generateInsertOperation(3, 'a'), result: '012a3' },
    { text: '0123', op: generateInsertOperation(4, 'a'), result: '0123a' },
    { text: '0123', op: generateInsertOperation(5, 'a'), throws: true },
    { text: '0123', op: generateDeleteOperation(-1), throws: true },
    { text: '0123', op: generateDeleteOperation(0), result: '123' },
    { text: '0123', op: generateDeleteOperation(1), result: '023' },
    { text: '0123', op: generateDeleteOperation(2), result: '013' },
    { text: '0123', op: generateDeleteOperation(3), result: '012' },
    { text: '', op: composeOperations(
      generateInsertOperation(0, 'a'),
      generateInsertOperation(1, 'b'),
      generateInsertOperation(2, 'c'),
      generateInsertOperation(3, 'd')
    ), result: 'abcd' },
    { text: '0123', op: composeOperations(
      generateDeleteOperation(0),
      generateInsertOperation(0, 'a'),
      generateDeleteOperation(1),
      generateInsertOperation(1, 'b')
    ), result: 'ab23' },
  ].forEach((test) => {
    if (test.throws) {
      it ('raises an error for op: ' + test.op.kind + ' on text: ' + test.text, () => {
        assert.throws(() => performTextOperation(test.text, test.op))
      })
    } else {
      it ('"' + test.text + '" turns into "' + test.result + '"', () => {
        assert.equal(test.result, performTextOperation(test.text, test.op))
      })
    }
  })
})
