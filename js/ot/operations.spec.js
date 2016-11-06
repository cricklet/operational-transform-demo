/* @flow weak */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'
import { assert, should } from 'chai'

import {
  generateDeleteOperation,
  generateInsertOperation,
  performTextOperation,
  inferOperations,
  performOperations
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

describe('inferOperations() & performOperations()', () => {
  it ('handles no-ops', () => {
    assert.deepEqual(
      [],
      inferOperations(
        'mary had a little lamb',
        'mary had a little lamb'))
  });
  [
    { oldText: '012',
      newText: '0112' },
    { oldText: '01',
      newText: '011' },
    { oldText: '0',
      newText: '00' },
    { oldText: '10',
      newText: '100' },
    { oldText: '0 2 4',
      newText: '0 4' },
    { oldText: '0  3  6',
      newText: '0 6' },
    { oldText: '0  3  6',
      newText: '0  6' },
    { oldText: '0  3  6',
      newText: '0   6' },
    { oldText: '0  3  6',
      newText: '0    6' },
    { oldText: '0123456789',
      newText: '0123789' },
    { oldText: '0123456789',
      newText: '0123' },
    { oldText: '0123456789',
      newText: '789' },
    { oldText: '0123456789',
      newText: '123456abc' },
    { oldText: '0123456789',
      newText: 'abc456789' },
    { oldText: '0123456789',
      newText: '0123abc6789' },
    { oldText: '0123456789',
      newText: '' },
    { oldText: '',
      newText: '0123456789' },
    { oldText: 'mary had a little lamb',
      newText: 'mary had a banana lamb' },
    { oldText: 'mary had a little lamb',
      newText: 'mary had lamb' },
    { oldText: 'mary had a little lamb',
      newText: 'marny had a little lamb' },
    { oldText: 'mary had a little lamb',
      newText: 'marmb' },
    { oldText: 'mary had a little lamb',
      newText: 'mary ' },
    { oldText: 'mary had a little lamb',
      newText: ' little lamb' },
    { oldText: 'mary had a little lamb',
      newText: 'mary had a litt' },
    { oldText: 'mary had a little lamb',
      newText: 'mary had a little pig' },
    { oldText: 'mary had a little lamb',
      newText: 'mary had a little   pig' },
    { oldText: 'mary had a little lamb',
      newText: 'george is silly' },
    { oldText: 'mary had a little lamb',
      newText: 'george has a mary has a little lamb' },
    { oldText: 'mary had a little lamb',
      newText: 'mary has a little lamb through time' },
    { oldText: 'mary had a little lamb',
      newText: 'mary qwerty has asdf a little zxcv lamb' }
  ].forEach((test) => {
    it ('handles "' + test.oldText + '" -> "' + test.newText + '"', () => {
      let ops = inferOperations(test.oldText, test.newText)
      assert.equal(test.newText, performOperations(test.oldText, ops))
    })
  });
})
