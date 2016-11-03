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

describe('text transforms', () => {
  it ('lower priority gets moved', () => {
    let transformed = transform(generateInsertOperation(1, 'a'),
                                generateInsertOperation(1, 'z'),
                                Less)
    assert.equal(transformed.position, 2)
    assert.equal(transformed.character, 'a')
  })
})
