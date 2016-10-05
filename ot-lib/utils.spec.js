"use strict"

import * as assert from 'assert'
import { expect } from 'chai'

import {
  Greater,
  Equal,
  Less,
  range,
  specificRange,
  maxOfIterable
} from './utils'

import type { Comparison } from './utils.js'

describe('iterators', () => {
  it ('range() works', () => {
    expect(Array.from(range(6)))
      .to.include.members([0,1,2,3,4,5])
  })
  it ('specificRange() works', () => {
    expect(Array.from(specificRange(2, 10, 2)))
      .to.include.members([4,6,8])
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
