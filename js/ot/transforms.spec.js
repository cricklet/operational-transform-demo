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
    let transformed = transform(generateDeleteOperation(1),
                                generateInsertOperation(1, 'a'),
                                Less)
    assert.equal(transformed.position, 2)
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
