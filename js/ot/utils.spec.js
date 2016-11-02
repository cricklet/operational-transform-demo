"use strict"

import * as assert from 'assert'
import { expect } from 'chai'

import {
  Greater,
  Equal,
  Less,
  range,
  specificRange,
  reverseRange,
  reverseSpecificRange,
  calculatePrefixLength,
  calculatePostfixLength,
  maxOfIterable,
  allKeys,
  repeat,
  concat,
  characters,
  substring,
  removeTail,
  reverse
} from './utils'

import type { Comparison } from './utils.js'

describe('iterators', () => {
  it ('range() works', () => {
    assert.deepEqual(
      Array.from(range(6)),
      [0,1,2,3,4,5])
  })
  it ('reverseRange() works', () => {
    assert.deepEqual(
      Array.from(reverseRange(6)),
      [5,4,3,2,1,0])
  })

  it ('specificRange() works', () => {
    assert.deepEqual(
      Array.from(specificRange(2, 9, 2)),
      [2,4,6,8])
  })
  it ('reverseSpecificRange() matches specificRange()', () => {
    assert.deepEqual(
      Array.from(reverseSpecificRange(2, 9, 2)),
      Array.from(specificRange(2, 9, 2)).reverse())
    assert.deepEqual(
      Array.from(reverseSpecificRange(2, 10, 2)),
      Array.from(specificRange(2, 10, 2)).reverse())
    assert.deepEqual(
      Array.from(reverseSpecificRange(2, 10, 3)),
      Array.from(specificRange(2, 10, 3)).reverse())
  })
})

describe('repeat', () => {
  it ('counts', () => {
    let counter = (i) => { return i }

    assert.deepEqual(
      Array.from(repeat(10, counter)),
      [0,1,2,3,4,5,6,7,8,9])
  })
})

describe('concat', () => {
  it ('works', () => {
    assert.deepEqual(
      concat([1,2,3], [4,5,6]),
      [1,2,3,4,5,6])
    assert.deepEqual(
      concat([1,2,3], 4),
      [1,2,3,4])
  })
})

describe('reverse', () => {
  it ('works', () => {
    assert.deepEqual(
      Array.from(reverse('asdf')),
      ['f', 'd', 's', 'a'])
  })
})

describe('characters', () => {
  it ('works', () => {
    assert.deepEqual(
      Array.from(characters('asdf')),
      ['a','s','d','f'])
    assert.deepEqual(
      Array.from(characters('asdf', range(2))),
      ['a','s'])
  })
})

describe('removeTail', () => {
  it ('works', () => {
    assert.deepEqual(
      Array.from(removeTail('asdf', 1)),
      ['a','s','d'])
    assert.deepEqual(
      Array.from(removeTail('asdf', 2)),
      ['a','s'])
  })
})

describe('substring', () => {
  it ('works', () => {
    assert.deepEqual(
      Array.from(substring('012345', {'start': 3})),
      ['3','4','5'])
    assert.deepEqual(
      Array.from(substring('012345', {'start': 3, 'stop': 5})),
      ['3','4'])
    assert.deepEqual(
      Array.from(substring('012345', {'step': 2})),
      ['0','2','4'])
  })
})

describe('string diffing', () => {
  it ('calculatePrefixLength() works', () => {
    assert.deepEqual(
      6,
      calculatePrefixLength(
        '012345asdf',
        '0123456789'))
    assert.deepEqual(
      6,
      calculatePrefixLength(
        '012345asdf',
        '012345'))
    assert.deepEqual(
      6,
      calculatePrefixLength(
        '012345',
        '012345'))
  })
  it ('calculatePostfixLength() works', () => {
    assert.deepEqual(
      3,
      calculatePostfixLength(
        '9876543210',
        'asdfasd210'))
    assert.deepEqual(
      6,
      calculatePostfixLength(
        '012345',
        '012345'))
    assert.deepEqual(
      3,
      calculatePostfixLength(
        '9876543210',
        '210'))
    assert.deepEqual(
      0,
      calculatePostfixLength(
        '9876543210',
        '987'))
  })
})

describe('maxOfIterable', () => {
  it ('works', () => {
    let intComparitor = (x: number, y: number) => {
      if (x > y) return Greater
      if (x < y) return Less
      if (x === y) return Equal
    }
    let ints = [2,5,3,6,1,9,3,5]
    let maxInt = Math.max(...ints)
    assert.equal(maxInt, maxOfIterable(ints, intComparitor))
  })
})

describe('allKeys', () => {
  it ('works', () => {
    expect(
      Array.from(allKeys({'a': 1, 'b': 2, 'c': 3}, {'b': 4, 'c': 4, 'd': 5})))
      .to.include.members(['a', 'b', 'c', 'd'])
  })
})
