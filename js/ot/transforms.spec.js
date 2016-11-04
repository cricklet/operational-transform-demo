"use strict"

import * as assert from 'assert'

import {
  Less,
  Greater,
  Equal
} from './utils.js'

import type {
  Priority
} from './sites.js'

import {
  generateInsertOperation,
  generateDeleteOperation
} from './operations.js'

import {
  transform
} from './transforms.js'


function transformPair(
  o1: TextOperation,
  o2: TextOperation,
  priority: Comparison
): [?TextOperation, ?TextOperation] {
  // Given two operations, o1 & o2, generate two new operations
  // o1p & o2p such that: o2p(o1(...)) === o1p(o2(...))

  // Rather than have `transform` deal with the priorities of
  // o1 & o2, the caller should pass in whether o1 is higher priority
  // than o2.

  return [
    transform(o1, o2, priority),
    transform(o2, o1, - priority)
  ]
}

describe('insert insert', () => {
  it ('lower priority gets moved', () => {
    let transformed = transform(generateInsertOperation(1, 'a'),
                                generateInsertOperation(1, 'z'),
                                Less)
    assert.equal(transformed.position, 2)
    assert.equal(transformed.character, 'a')
  })
  it ('higher priority stays', () => {
    let transformed = transform(generateInsertOperation(1, 'a'),
                                generateInsertOperation(1, 'z'),
                                Greater)
    assert.equal(transformed.position, 1)
    assert.equal(transformed.character, 'a')
  })
  it ('after gets moved', () => {
    let transformed = transform(generateInsertOperation(4, 'a'),
                                generateInsertOperation(1, 'z'),
                                Less)
    assert.equal(transformed.position, 5)
    assert.equal(transformed.character, 'a')
  })
  it ('before stays', () => {
    let transformed = transform(generateInsertOperation(1, 'a'),
                                generateInsertOperation(4, 'z'),
                                Less)
    assert.equal(transformed.position, 1)
    assert.equal(transformed.character, 'a')
  })
})

describe('delete delete', () => {
  it ('identical deletes are ignored', () => {
    let transformed = transform(generateDeleteOperation(1),
                                generateDeleteOperation(1),
                                Less)
    assert.equal(transformed, null)
  })
  it ('after gets moved', () => {
    let transformed = transform(generateDeleteOperation(4),
                                generateDeleteOperation(1),
                                Less)
    assert.equal(transformed.position, 3)
  })
  it ('before stays', () => {
    let transformed = transform(generateDeleteOperation(1),
                                generateDeleteOperation(4),
                                Less)
    assert.equal(transformed.position, 1)
  })
})

describe('insert delete', () => {
  it ('insert before moves the delete', () => {
    let transformed = transform(generateDeleteOperation(2),
                                generateInsertOperation(1, 'a'),
                                Less)
    assert.equal(transformed.position, 3)
  })
  it ('insert after keeps the delete', () => {
    let transformed = transform(generateDeleteOperation(1),
                                generateInsertOperation(2, 'a'),
                                Less)
    assert.equal(transformed.position, 1)
  })
})

describe('delete insert', () => {
  it ('delete before moves the insert', () => {
    let transformed = transform(generateInsertOperation(4, 'a'),
                                generateDeleteOperation(1),
                                Less)
    assert.equal(transformed.position, 3)
  })
  it ('delete after keeps the insert', () => {
    let transformed = transform(generateInsertOperation(1, 'a'),
                                generateDeleteOperation(2),
                                Less)
    assert.equal(transformed.position, 1)
  })
})
