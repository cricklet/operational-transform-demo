/* @flow weak */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'

import * as Operations from './operations.js'

describe('apply()', () => {
  [ { text: '0123', op: Operations.generateInsert(-1, 'a'), throws: true },
    { text: '0123', op: Operations.generateInsert(5, 'a'),  throws: true },
    { text: '0123', op: Operations.generateInsert(1, 'a'),  result: '0a123' },
    { text: '0123', op: Operations.generateInsert(4, 'a'),  result: '0123a' },
    { text: '0123', op: Operations.generateDelete(-1, 1),   throws: true },
    { text: '0123', op: Operations.generateDelete(-1, 0),   throws: true },
    { text: '0123', op: Operations.generateDelete(0, 4),    result: '' },
    { text: '0123', op: Operations.generateDelete(0, 5),    throws: true },
    { text: '0123', op: Operations.generateDelete(3, 1),    result: '012' }
  ].forEach((test) => {
    if (test.throws) {
      it ('raises an error for op: ' + Operations.opsString(test.op) + ' on text: ' + test.text, () => {
        assert.throws(() => Operations.apply(test.text, test.op))
      })
    } else {
      it ('"' + test.text + '" + ' + Operations.opsString(test.op) + ' turns into "' + test.result + '"', () => {
        assert.equal(test.result, Operations.apply(test.text, test.op))
      })
    }
  })
})

describe('transform()', () => {
  [ [Operations.generateInsert(1, 'asdf'), Operations.generateInsert(3, 'qwerty')],
    [Operations.generateInsert(5, 'asdf'), Operations.generateInsert(3, 'qwerty')],
    [Operations.generateInsert(9, 'asdf'), Operations.generateInsert(3, 'qwerty')],
    [Operations.generateInsert(1, 'asdf'), Operations.generateDelete(3, 5)],
    [Operations.generateInsert(5, 'asdf'), Operations.generateDelete(3, 5)],
    [Operations.generateInsert(9, 'asdf'), Operations.generateDelete(3, 5)],
    [Operations.generateDelete(1, 5), Operations.generateInsert(1, 'asdf')],
    [Operations.generateDelete(5, 5), Operations.generateInsert(5, 'asdf')],
    [Operations.generateDelete(9, 5), Operations.generateInsert(9, 'asdf')],
  ].forEach(([op1, op2]) => {
    it (Operations.opsString(op1) + ', ' + Operations.opsString(op2) + ' are propertly transformed', () => {
      let [op1P, op2P] = Operations.transform(op1, op2)

      assert.equal(
        Operations.apply(Operations.apply("0123456789abcdefghijk", op1), op2P),
        Operations.apply(Operations.apply("0123456789abcdefghijk", op1), op2P))
    })
  })
})

describe('compose()', () => {
  [ ['012345', Operations.generateInsert(1, 'asdf'), Operations.generateInsert(3, 'qwerty'), '0asqwertydf12345'],
    ['012345', Operations.generateInsert(1, 'asdf'), Operations.generateDelete(3, 3), '0as2345']
  ].forEach(([start, op1, op2, result]) => {
    it (start + ' becomes ' + result + ' via ' + Operations.opsString(op1) + ', ' + Operations.opsString(op2), () => {
      assert.equal(
        result,
        Operations.apply(start, Operations.compose(op1, op2)))
      assert.equal(
        result,
        Operations.apply(Operations.apply(start, op1), op2))
    })
  })
})
