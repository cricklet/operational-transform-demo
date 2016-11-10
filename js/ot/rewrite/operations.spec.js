/* @flow weak */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert, should } from 'chai'

import * as Operations from './operations.js'

let FAKE_STATE = 'xyz'

describe('apply()', () => {
  [ { text: '0123', op: Operations.generateInsert(-1, 'a', FAKE_STATE), throws: true },
    { text: '0123', op: Operations.generateInsert(5, 'a', FAKE_STATE),  throws: true },
    { text: '0123', op: Operations.generateInsert(1, 'a', FAKE_STATE),  result: '0a123' },
    { text: '0123', op: Operations.generateInsert(4, 'a', FAKE_STATE),  result: '0123a' },
    { text: '0123', op: Operations.generateDelete(-1, 1, FAKE_STATE),   throws: true },
    { text: '0123', op: Operations.generateDelete(-1, 0, FAKE_STATE),   throws: true },
    { text: '0123', op: Operations.generateDelete(0, 4, FAKE_STATE),    result: '' },
    { text: '0123', op: Operations.generateDelete(0, 5, FAKE_STATE),    throws: true },
    { text: '0123', op: Operations.generateDelete(3, 1, FAKE_STATE),    result: '012' }
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
  [ [Operations.generateInsert(1, 'asdf', FAKE_STATE), Operations.generateInsert(3, 'qwerty', FAKE_STATE)],
    [Operations.generateInsert(5, 'asdf', FAKE_STATE), Operations.generateInsert(3, 'qwerty', FAKE_STATE)],
    [Operations.generateInsert(9, 'asdf', FAKE_STATE), Operations.generateInsert(3, 'qwerty', FAKE_STATE)],
  ].forEach(([op1, op2]) => {
    it (op1.hash + ', ' + op2.hash + ' are propertly transformed', () => {
      let [op1P, op2P] = Operations.transform(op1, op2)

      assert.equal(
        Operations.apply(Operations.apply("0123456789", op1), op2P),
        Operations.apply(Operations.apply("0123456789", op1), op2P))
    })
  })
})
