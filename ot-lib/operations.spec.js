"use strict"
/* @flow */

import * as assert from 'assert'

import {
  generateDeleteOperation,
  generateInsertOperation,
  performTextOperation
} from './operations'


describe('performTextOperation', function() {
  it('insertion works', function() {
    assert.equal(
      'as2df',
      performTextOperation('asdf', generateInsertOperation(2, '2'))
    )
  })

  it('deletion works', function() {
    assert.equal(
      '013',
      performTextOperation('0123', generateDeleteOperation(2))
    )
  })
})
