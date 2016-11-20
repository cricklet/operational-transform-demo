/* @flow weak */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'

import * as Operations from './operations.js'
import { apply, transform, compose, generateInsert, generateDelete, opsString } from './operations.js'

describe('apply()', () => {
  [ { text: '0123', op: generateInsert(-1, 'a'), throws: true },
    { text: '0123', op: generateInsert(5, 'a'),  throws: true },
    { text: '0123', op: generateInsert(1, 'a'),  result: '0a123' },
    { text: '0123', op: generateInsert(4, 'a'),  result: '0123a' },
    { text: '0123', op: generateDelete(-1, 1),   throws: true },
    { text: '0123', op: generateDelete(-1, 0),   throws: true },
    { text: '0123', op: generateDelete(0, 4),    result: '' },
    { text: '0123', op: generateDelete(0, 5),    throws: true },
    { text: '0123', op: generateDelete(3, 1),    result: '012' }
  ].forEach((test) => {
    if (test.throws) {
      it ('raises an error for op: ' + opsString(test.op) + ' on text: ' + test.text, () => {
        assert.throws(() => apply(test.text, test.op))
      })
    } else {
      it ('"' + test.text + '" + ' + opsString(test.op) + ' turns into "' + test.result + '"', () => {
        assert.equal(test.result, apply(test.text, test.op))
      })
    }
  })
})

describe('transform()', () => {
  [ [generateInsert(1, 'asdf'), generateInsert(3, 'qwerty')],
    [generateInsert(5, 'asdf'), generateInsert(3, 'qwerty')],
    [generateInsert(9, 'asdf'), generateInsert(3, 'qwerty')],
    [generateInsert(1, 'asdf'), generateDelete(3, 5)],
    [generateInsert(5, 'asdf'), generateDelete(3, 5)],
    [generateInsert(9, 'asdf'), generateDelete(3, 5)],
    [generateDelete(1, 5), generateInsert(1, 'asdf')],
    [generateDelete(5, 5), generateInsert(5, 'asdf')],
    [generateDelete(9, 5), generateInsert(9, 'asdf')],
  ].forEach(([op1, op2]) => {
    it (opsString(op1) + ', ' + opsString(op2) + ' are propertly transformed', () => {
      let [op1P, op2P] = transform(op1, op2)

      assert.equal(
        apply(apply("012345678901234567890123456789", op1), op2P),
        apply(apply("012345678901234567890123456789", op2), op1P))
    })
  })
})

describe('compose()', () => {
  [ ['012345', generateInsert(1, 'asdf'), generateInsert(3, 'qwerty'), '0asqwertydf12345'],
    ['012345', generateInsert(1, 'asdf'), generateDelete(3, 3), '0as2345'],
    ['012345', generateDelete(1, 3), generateDelete(1, 1), '05'],
    ['012345', generateDelete(1, 3), generateInsert(2, 'asdf'), '04asdf5']
  ].forEach(([start, op1, op2, result]) => {
    it (start + ' becomes ' + result + ' via ' + opsString(op1) + ', ' + opsString(op2), () => {
      assert.equal(
        result,
        apply(start, compose(op1, op2)))
      assert.equal(
        result,
        apply(apply(start, op1), op2))
    })
  })

  describe('combinatorial', () => {
    let ops = [
      generateInsert(1, 'asdf'), generateInsert(3, 'qwerty'),
      generateInsert(5, 'banana'),
      generateDelete(0, 2), generateDelete(2, 2),
      generateDelete(4, 3)]

    ops.forEach(op1 => {
      ops.forEach(op2 => {
        describe('composing two ops', () => {
          let start = '0123456789'
          let result
          try { result = apply(apply(start, op1), op2) }
          catch (e) { result = 'error' }

          it (opsString(op1) + ', ' + opsString(op2) + ' turns ' + start + ' into ' + result, () => {
            if (result === 'error') {
              assert.throws(() => apply(start, compose(op1, op2)))
            } else {
              assert.equal(
                result,
                apply(start, compose(op1, op2)))
            }
          })
        })

        // describe('transforming two ops', () => {
        //   it (opsString(op1) + ', ' + opsString(op2) + ' are propertly transformed', () => {
        //     let [op1P, op2P] = transform(op1, op2)
        //
        //     assert.equal(
        //       apply(apply("0123456789abcdefghijk", op1), op2P),
        //       apply(apply("0123456789abcdefghijk", op2), op1P))
        //   })
        // })

        ops.forEach(op3 => {
          // describe('transforming three ops', () => {
          //   it (opsString(op1) + ', ' + opsString(op2) + ', ' + opsString(op3) + ' are propertly transformed', () => {
          //     let [c1, c2] = [compose(op1, op2), op3]
          //     let [c1P, c2P] = transform(c1, c2)
          //
          //     assert.equal(
          //       apply(apply("0123456789", c1), c2P),
          //       apply(apply("0123456789", c2), c2P))
          //   })
          // })

          describe('composing three ops', () => {
            let start = '0123456789'
            let result
            try { result = apply(apply(apply(start, op1), op2), op3) }
            catch (e) { result = 'error' }

            it (opsString(op1) + ', ' + opsString(op2) + ', ' + opsString(op3) + ' turns ' + start + ' into ' + result, () => {
              if (result === 'error') {
                assert.throws(() => apply(start, compose(op1, compose(op2, op3))))
                assert.throws(() => apply(start, compose(compose(op1, op2), op3)))
              } else {
                assert.equal(
                  result,
                  apply(start, compose(op1, compose(op2, op3))))
                assert.equal(
                  result,
                  apply(start, compose(compose(op1, op2), op3)))
              }
            })
          })
        })
      })
    })
  })
})
