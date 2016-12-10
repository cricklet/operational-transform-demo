/* @flow */

import { expect } from 'chai'
import { spy } from 'sinon'
import { assert } from 'chai'

import type { Record, RecordFactory } from './record'
import { generateRecordFactory } from './record'

describe('record', () => {
  it('works', () => {
    type ABRecord = Record<{a: number, b: number}>
    let ABRecordFactory: RecordFactory<ABRecord> = generateRecordFactory('a', 'b')

    var x: ABRecord = ABRecordFactory({a:1, b:1})

    assert.equal(x.a, 1)
    assert.equal(x.b, 1)

    assert.throws(() => ABRecordFactory({a:1}))
    assert.throws(() => ABRecordFactory({}))
  })

  it('throw on incomplete definitions', () => {
    type ABRecord = Record<{a: number, b: number}>
    let ABRecordFactory: RecordFactory<ABRecord> = generateRecordFactory('a')

    assert.throws(() => ABRecordFactory({a:1, b:2}))
  })

  it('works for generics', () => {
    type ABRecord = Record<{a: number, b: number}>
    type CRecord<A> = Record<{ c: A }>
    let CRecordFactory: RecordFactory<CRecord<*>> = generateRecordFactory('c')

    CRecordFactory({c: {a:1, b:2}})
  })
})
