/* @flow */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

// @flow-ignore
import { assert, should } from 'chai'

import {
  Greater,
  Equal,
  Less
} from './utils'

import type { Comparison } from './utils.js'

import { updateStateWithOperation, priorityComparitor, stateComparitor } from './sites.js'

describe('siteComparitor()', () => {
  it ('works', () => {
    assert.equal(Less,    stateComparitor({'a': 1}, {'a': 2}))
    assert.equal(Less,    stateComparitor({},       {'a': 2}))
    assert.equal(Greater, stateComparitor({'a': 3}, {'a': 2}))
    assert.equal(Greater, stateComparitor({'a': 1}, {}))
    assert.equal(Equal,   stateComparitor({'a': 1}, {'a': 1}))
  })
})

describe('priorityComparitor()', () => {
  it ('simple priorities', () => {
    assert.equal(priorityComparitor(['1'], ['2']), Less)
    assert.equal(priorityComparitor(['2'], ['1']), Greater)
    assert.equal(priorityComparitor(['2'], ['2']), Equal)
  })
  it ('sub-list priorities', () => {
    assert.equal(
      Less,
      priorityComparitor(
        ['2','3','4'],
        ['2','3','4','1']))

    assert.equal(
      Greater,
      priorityComparitor(
        ['2','3','4','1'],
        ['2','3','4']))

    assert.equal(
      Equal,
      priorityComparitor(
        ['2','3','4'],
        ['2','3','4']))
  })
  it ('differing priorities', () => {
    assert.equal(
      Less,
      priorityComparitor(
        ['2','3','1'],
        ['2','3','4']))

    assert.equal(
      Greater,
      priorityComparitor(
        ['2','3','4'],
        ['2','3','1']))

    assert.equal(
      Equal,
      priorityComparitor(
        ['2','3','1'],
        ['2','3','1']))
  })
})

describe('updateStateWithOperation()', () => {
  it('works', () => {
    assert.deepEqual(
      updateStateWithOperation({'a': 1}, 'b'),
      {'a': 1, 'b': 1})
    assert.deepEqual(
      updateStateWithOperation({'a': 1}, 'a'),
      {'a': 2})
  })
})
