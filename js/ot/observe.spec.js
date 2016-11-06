/* @flow */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert, should } from 'chai'

import {
  observeArray,
  unobserveArray,
  observeObject,
  unobserveObject,
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
      debugger;
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
      debugger;
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
      debugger;
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
      debugger;
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
