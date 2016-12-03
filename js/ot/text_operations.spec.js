/* @flow weak */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'
import { assert } from 'chai'

import {
  generateInsert,
  generateDelete,
  SimpleTextApplier,
  SuboperationsTransformer
} from './text_operations.js'

function opsString <A> (as: A[]): string {
  return "[" + as.join(', ') + "]"
}

let applier = new SimpleTextApplier()
let transformer = new SuboperationsTransformer()

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
    [generateInsert(1, 'asdf'), generateInsert(3, 'qwerty')],
    [generateInsert(5, 'asdf'), generateInsert(3, 'qwerty')],
    [generateInsert(9, 'asdf'), generateInsert(3, 'qwerty')],
    [generateInsert(1, 'asdf'), generateDelete(3, 5)],
    [generateInsert(5, 'asdf'), generateDelete(3, 5)],
    [generateInsert(9, 'asdf'), generateDelete(3, 5)],
    [generateDelete(1, 5), generateInsert(1, 'asdf')],
    [generateDelete(5, 5), generateInsert(5, 'asdf')],
    [generateDelete(9, 5), generateInsert(9, 'asdf')],
    [generateDelete(0, 1), generateInsert(1, 'a')],
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
    ['012345', generateInsert(1, 'asdf'), generateInsert(3, 'qwerty'), '0asqwertydf12345'],
    ['012345', generateInsert(1, 'asdf'), generateDelete(3, 3), '0as2345'],
    ['012345', generateDelete(1, 3), generateDelete(1, 1), '05'],
    ['012345', generateDelete(1, 3), generateInsert(2, 'asdf'), '04asdf5']
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
    generateInsert(1, 'asdf'), generateInsert(3, 'qwerty'),
    // generateInsert(5, 'banana'),
    generateDelete(0, 2), generateDelete(2, 2),]
    // generateDelete(4, 3)]

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
