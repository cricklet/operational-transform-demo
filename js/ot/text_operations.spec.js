/* @flow weak */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'
import { assert } from 'chai'

import {
  insertOp,
  deleteOp,
  retainFactory,
  SimpleTextApplier,
  SuboperationsTransformer
} from './text_operations.js'

function opsString <A> (as: A[]): string {
  return "[" + as.join(', ') + "]"
}

let applier = new SimpleTextApplier()
let transformer = new SuboperationsTransformer(retainFactory)

describe('apply()', () => {
  [ { text: '0123', op: insertOp(-1, 'a'), throws: true },
    { text: '0123', op: insertOp(5, 'a'),  throws: true },
    { text: '0123', op: insertOp(1, 'a'),  result: '0a123' },
    { text: '0123', op: insertOp(4, 'a'),  result: '0123a' },
    { text: '0123', op: deleteOp(-1, 1),   throws: true },
    { text: '0123', op: deleteOp(-1, 0),   throws: true },
    { text: '0123', op: deleteOp(0, 4),    result: '' },
    { text: '0123', op: deleteOp(0, 5),    throws: true },
    { text: '0123', op: deleteOp(3, 1),    result: '012' }
  ].forEach((test) => {
    if (test.throws) {
      it ('raises an error for op: ' + opsString(test.op) + ' on text: ' + test.text, () => {
        assert.throws(() => applier.apply(test.text, test.op))
      })
    } else {
      it ('"' + test.text + '" + ' + opsString(test.op) + ' turns into "' + test.result + '"', () => {
        assert.equal(test.result, applier.apply(test.text, test.op))
      })
    }
  })
})

describe('transform()', () => {
  [
    [insertOp(1, 'asdf'), insertOp(3, 'qwerty')],
    [insertOp(5, 'asdf'), insertOp(3, 'qwerty')],
    [insertOp(9, 'asdf'), insertOp(3, 'qwerty')],
    [insertOp(1, 'asdf'), deleteOp(3, 5)],
    [insertOp(5, 'asdf'), deleteOp(3, 5)],
    [insertOp(9, 'asdf'), deleteOp(3, 5)],
    [deleteOp(1, 5), insertOp(1, 'asdf')],
    [deleteOp(5, 5), insertOp(5, 'asdf')],
    [deleteOp(9, 5), insertOp(9, 'asdf')],
    [deleteOp(0, 1), insertOp(1, 'a')],
  ].forEach(([op1, op2]) => {
    it (opsString(op1) + ', ' + opsString(op2) + ' are propertly transformed', () => {
      let [op1P, op2P] = transformer.transform(op1, op2)

      assert.equal(
        applier.apply(applier.apply("012345678901234567890123456789", op1), op2P),
        applier.apply(applier.apply("012345678901234567890123456789", op2), op1P))
    })
  })
})

describe('compose()', () => {
  [
    ['012345', insertOp(1, 'asdf'), insertOp(3, 'qwerty'), '0asqwertydf12345'],
    ['012345', insertOp(1, 'asdf'), deleteOp(3, 3), '0as2345'],
    ['012345', deleteOp(1, 3), deleteOp(1, 1), '05'],
    ['012345', deleteOp(1, 3), insertOp(2, 'asdf'), '04asdf5']
  ].forEach(([start, op1, op2, result]) => {
    it (start + ' becomes ' + result + ' via ' + opsString(op1) + ', ' + opsString(op2), () => {
      assert.equal(
        result,
        applier.apply(start, transformer.compose(op1, op2)))
      assert.equal(
        result,
        applier.apply(applier.apply(start, op1), op2))
    })
  })
})


describe('combinatorial', () => {
  let ops = [
    insertOp(1, 'asdf'), insertOp(3, 'qwerty'),
    // insertOp(5, 'banana'),
    deleteOp(0, 2), deleteOp(2, 2),]
    // deleteOp(4, 3)]

  ops.forEach(op1 => {
    ops.forEach(op2 => {
      describe('composing two ops', () => {
        let start = '0123456789'
        let result
        try { result = applier.apply(applier.apply(start, op1), op2) }
        catch (e) { result = 'error' }

        it (opsString(op1) + ', ' + opsString(op2) + ' turns ' + start + ' into ' + result, () => {
          if (result === 'error') {
            assert.throws(() => applier.apply(start, transformer.compose(op1, op2)))
          } else {
            assert.equal(
              result,
              applier.apply(start, transformer.compose(op1, op2)))
          }
        })
      })

      describe('transforming two ops', () => {
        it (opsString(op1) + ', ' + opsString(op2) + ' are propertly transformed', () => {
          let [op1P, op2P] = transformer.transform(op1, op2)

          assert.equal(
            applier.apply(applier.apply("0123456789abcdefghijk", op1), op2P),
            applier.apply(applier.apply("0123456789abcdefghijk", op2), op1P))
        })
      })

      ops.forEach(op3 => {
        describe('transforming three ops', () => {
          it (opsString(op1) + ', ' + opsString(op2) + ', ' + opsString(op3) + ' are propertly transformed', () => {
            let [c1, c2] = [transformer.compose(op1, op2), op3]
            let [c1P, c2P] = transformer.transform(c1, c2)

            assert.equal(
              applier.apply(applier.apply("0123456789", c1), c2P),
              applier.apply(applier.apply("0123456789", c2), c1P))
          })
        })

        describe('composing three ops', () => {
          let start = '0123456789'
          let result
          try { result = applier.apply(applier.apply(applier.apply(start, op1), op2), op3) }
          catch (e) { result = 'error' }

          it (opsString(op1) + ', ' + opsString(op2) + ', ' + opsString(op3) + ' turns ' + start + ' into ' + result, () => {
            if (result === 'error') {
              assert.throws(() => applier.apply(start, transformer.compose(op1, transformer.compose(op2, op3))))
            } else {
              assert.equal(
                result,
                applier.apply(start, transformer.compose(op1, transformer.compose(op2, op3))))
            }
          })
        })
      })
    })
  })
})
