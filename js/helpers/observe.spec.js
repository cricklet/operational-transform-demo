/* @flow */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'

import {
  observeArray,
  unobserveArray,
  observeObject,
  unobserveObject,
  autoFill
} from './observe'

describe('observeObject', () => {
  it ('onKeyAdded works', (done) => {
    let obj: {[key: string]: any} = {'a': 1}

    let onKeyAdded = spy()
    let onKeyRemoved = spy()
    let onKeyChanged = spy()

    let observer = observeObject(obj, onKeyAdded, onKeyRemoved, onKeyChanged)

    obj['b'] = 2

    setTimeout(() => {
      assert.isTrue(onKeyAdded.calledOnce)
      assert.isTrue(onKeyAdded.calledWith(obj, 'b'))
      assert.isFalse(onKeyRemoved.calledOnce)
      assert.isFalse(onKeyChanged.calledOnce)
      done()
    })
  })
  it ('onKeyRemoved works', (done) => {
    let obj: {[key: string]: any} = {'a': 1}

    let onKeyAdded = spy()
    let onKeyRemoved = spy()
    let onKeyChanged = spy()

    let observer = observeObject(obj, onKeyAdded, onKeyRemoved, onKeyChanged)

    delete obj['a']

    setTimeout(() => {
      assert.isFalse(onKeyAdded.calledOnce)
      assert.isTrue(onKeyRemoved.calledOnce)
      assert.isTrue(onKeyRemoved.calledWith(obj, 'a'))
      assert.isFalse(onKeyChanged.calledOnce)
      done()
    })
  })
  it ('onKeyChanged works', (done) => {
    let obj: {[key: string]: any} = {'a': 1}

    let onKeyAdded = spy()
    let onKeyRemoved = spy()
    let onKeyChanged = spy()

    let observer = observeObject(obj, onKeyAdded, onKeyRemoved, onKeyChanged)

    obj['a'] = 3

    setTimeout(() => {
      assert.isFalse(onKeyAdded.calledOnce)
      assert.isFalse(onKeyRemoved.calledOnce)
      assert.isTrue(onKeyChanged.calledOnce)
      assert.isTrue(onKeyChanged.calledWith(obj, 'a'))
      done()
    })
  })
  it ('onKeyChanged works', (done) => {
    let obj: {[key: string]: any} = {'a': 1}

    let onKeyAdded = spy()
    let onKeyRemoved = spy()
    let onKeyChanged = spy()

    let observer = observeObject(obj, onKeyAdded, onKeyRemoved, onKeyChanged)

    obj['a'] = 3

    setTimeout(() => {
      assert.isFalse(onKeyAdded.calledOnce)
      assert.isFalse(onKeyRemoved.calledOnce)
      assert.isTrue(onKeyChanged.calledOnce)
      assert.isTrue(onKeyChanged.calledWith(obj, 'a'))
      done()
    })
  })
})

describe('observeArray', () => {
  it ('onAdd works', (done) => {
    let arr = [1,2,3]
    let onAdd = spy()
    let onRemove = spy()

    let observer = observeArray(arr, onAdd, onRemove)

    arr.push(4)

    setTimeout(() => {
      assert.isTrue(onAdd.calledOnce)
      assert.isTrue(onAdd.calledWith(4))
      assert.isFalse(onRemove.calledOnce)
      done()
    })
  })
  it ('onRemove works', (done) => {
    let arr = [1,2,3]
    let onAdd = spy()
    let onRemove = spy()

    let observer = observeArray(arr, onAdd, onRemove)

    arr.pop()

    setTimeout(() => {
      assert.isFalse(onAdd.calledOnce)
      assert.isTrue(onRemove.calledOnce)
      assert.isTrue(onRemove.calledWith(3))
      done()
    })
  })
  it ('unobserveArray works', (done) => {
    let arr = [1,2,3]
    let onAdd = spy()
    let onRemove = spy()

    let observer = observeArray(arr, onAdd, onRemove)

    unobserveArray(arr, observer)

    arr.push(4)
    arr.pop()

    setTimeout(() => {
      assert.isFalse(onAdd.calledOnce)
      assert.isFalse(onRemove.calledOnce)
      done()
    })
  })
})

describe('AutoMap', () => {
  it ('adds', (done) => {
    let array = []
    let obj = {}

    autoFill(array, obj, o => o.key)

    array.push({key: 'banana', value: 'fruit'})
    array.push({key: 'dog', value: 'animal'})

    setTimeout(() => {
      assert.deepEqual(Object.keys(obj), ['banana', 'dog'])
      done()
    })
  })
  it ('starts with', (done) => {
    let array = [{key: 'banana', value: 'fruit'}, {key: 'dog', value: 'animal'}]
    let obj = {}

    autoFill(array, obj, o => o.key)

    setTimeout(() => {
      assert.deepEqual(Object.keys(obj), ['banana', 'dog'])
      done()
    })
  })
  it ('deletes', (done) => {
    let array = [{key: 'banana', value: 'fruit'}, {key: 'dog', value: 'animal'}]
    let obj = {}

    autoFill(array, obj, o => o.key)
    array.pop()

    setTimeout(() => {
      assert.deepEqual(Object.keys(obj), ['banana'])
      done()
    })
  })
})
