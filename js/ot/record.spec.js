/* @flow */

import { expect } from 'chai'
import { spy } from 'sinon'
import { assert } from 'chai'

import type { Record } from './record'
import { RecordFactory } from './record'

describe('record', () => {
  it('works', () => {
    type ABRecord = Record<{a: number, b: number}>
    const ABRecordFactory = RecordFactory({a: undefined, b: undefined})

    var x: ABRecord = ABRecordFactory({a:1, b:1})

    assert.throws(() => ABRecordFactory({a:1}))
    assert.throws(() => ABRecordFactory({}))
  })
})
