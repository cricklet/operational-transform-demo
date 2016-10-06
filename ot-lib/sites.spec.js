"use strict"

import * as assert from 'assert'
import { expect } from 'chai'

import {
  Greater,
  Equal,
  Less
} from './utils'

import type { Comparison } from './utils.js'

import { priorityComparitor } from './sites.js'

describe('priorityComparitor()', () => {
  it ('simple priorities', () => {
    assert.equal(priorityComparitor([1], [2]), Less)
    assert.equal(priorityComparitor([2], [1]), Greater)
    assert.equal(priorityComparitor([2], [2]), Equal)
  })
  it ('sub-list priorities', () => {
    assert.equal(
      Less,
      priorityComparitor(
        [2,3,4],
        [2,3,4,1]))

    assert.equal(
      Greater,
      priorityComparitor(
        [2,3,4,1],
        [2,3,4]))

    assert.equal(
      Equal,
      priorityComparitor(
        [2,3,4],
        [2,3,4]))
  })
  it ('differing priorities', () => {
    assert.equal(
      Less,
      priorityComparitor(
        [2,3,1],
        [2,3,4]))

    assert.equal(
      Greater,
      priorityComparitor(
        [2,3,4],
        [2,3,1]))

    assert.equal(
      Equal,
      priorityComparitor(
        [2,3,1],
        [2,3,1]))
  })
})
