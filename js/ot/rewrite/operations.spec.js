/* @flow weak */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'

import * as Operations from './operations.js'

let PARENT_HASH = 'xyz'

describe('apply()', () => {
  [ { text: '0123', op: Operations.generateInsert(-1, 'a', PARENT_HASH), throws: true },
    { text: '0123', op: Operations.generateInsert(5, 'a', PARENT_HASH),  throws: true },
    { text: '0123', op: Operations.generateInsert(1, 'a', PARENT_HASH),  result: '0a123' },
    { text: '0123', op: Operations.generateInsert(4, 'a', PARENT_HASH),  result: '0123a' },
    { text: '0123', op: Operations.generateDelete(-1, 1, PARENT_HASH),   throws: true },
    { text: '0123', op: Operations.generateDelete(-1, 0, PARENT_HASH),   throws: true },
    { text: '0123', op: Operations.generateDelete(0, 4, PARENT_HASH),    result: '' },
    { text: '0123', op: Operations.generateDelete(0, 5, PARENT_HASH),    throws: true },
    { text: '0123', op: Operations.generateDelete(3, 1, PARENT_HASH),    result: '012' }
  ].forEach((test) => {
    if (test.throws) {
      it ('raises an error for op: ' + test.op.hash + ' on text: ' + test.text, () => {
        assert.throws(() => Operations.apply(test.text, test.op))
      })
    } else {
      it ('"' + test.text + '" + ' + test.op.hash + ' turns into "' + test.result + '"', () => {
        assert.equal(test.result, Operations.apply(test.text, test.op))
      })
    }
  })
})

describe('transform()', () => {
  [ [Operations.generateInsert(1, 'asdf', PARENT_HASH), Operations.generateInsert(3, 'qwerty', PARENT_HASH)],
    [Operations.generateInsert(5, 'asdf', PARENT_HASH), Operations.generateInsert(3, 'qwerty', PARENT_HASH)],
    [Operations.generateInsert(9, 'asdf', PARENT_HASH), Operations.generateInsert(3, 'qwerty', PARENT_HASH)],
    [Operations.generateInsert(1, 'asdf', PARENT_HASH), Operations.generateDelete(3, 5, PARENT_HASH)],
    [Operations.generateInsert(5, 'asdf', PARENT_HASH), Operations.generateDelete(3, 5, PARENT_HASH)],
    [Operations.generateInsert(9, 'asdf', PARENT_HASH), Operations.generateDelete(3, 5, PARENT_HASH)],
    [Operations.generateDelete(1, 5, PARENT_HASH), Operations.generateInsert(1, 'asdf', PARENT_HASH)],
    [Operations.generateDelete(5, 5, PARENT_HASH), Operations.generateInsert(5, 'asdf', PARENT_HASH)],
    [Operations.generateDelete(9, 5, PARENT_HASH), Operations.generateInsert(9, 'asdf', PARENT_HASH)],
  ].forEach(([op1, op2]) => {
    it (op1.hash + ', ' + op2.hash + ' are propertly transformed', () => {
      let [op1P, op2P] = Operations.transform(op1, op2)

      assert.equal(
        Operations.apply(Operations.apply("0123456789abcdefghijk", op1), op2P),
        Operations.apply(Operations.apply("0123456789abcdefghijk", op1), op2P))
    })
  })
})
