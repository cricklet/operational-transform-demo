"use strict"

import * as assert from 'assert'
import { expect } from 'chai'

import {
  Greater,
  Equal,
  Less,
  range,
  specificRange
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
