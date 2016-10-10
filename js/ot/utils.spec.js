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
  firstDifference,
  lastDifference,
  maxOfIterable,
  allKeys,
  repeat,
  concat
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

describe('string diffing', () => {
  it ('firstDifference() works', () => {
    assert.deepEqual(
      firstDifference(
        '012345asdf',
        '0123456789'),
      6)
    assert.deepEqual(
      firstDifference(
        '012345asdf',
        '012345'),
      6)
    assert.deepEqual(
      firstDifference(
        '012345',
        '012345'),
      -1)
  })
  it ('lastDifference() works', () => {
    assert.deepEqual(
      lastDifference(
        '0123456789',
        'asdfas6789'),
      5)
    assert.deepEqual(
      lastDifference(
        '0123456789',
        '0123456789'),
      -1)
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
