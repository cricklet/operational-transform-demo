/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy, useFakeTimers } from 'sinon'

import { assert } from 'chai'
import { map, zip } from 'wu'

import { shuffle, push, concat } from './utils.js'
import { SimulatedRouter } from './router.js'

describe("SimulatedRouter", () => {
  let clock

  beforeEach(function() {
    clock = useFakeTimers()
  })

  afterEach(function() {
    clock.restore()
  })

  function createRouter() {
    let vs: number[] = []
    let r: SimulatedRouter<number, number> = new SimulatedRouter(
      { minDelay: 1000, maxDelay: 2000, dropPercentage: 0.5 },
      s => {})
    r.onReceive = (v: number) => { vs.push(v) }

    return [vs, r]
  }

  it("sends", () => {
    let [vs0, r0] = createRouter()
    let [vs1, r1] = createRouter()

    r0.connect(r1)
    r1.connect(r0)

    r0.broadcast(5)
    r0.broadcast(4)
    r0.broadcast(3)

    r1.broadcast(0)
    r1.broadcast(1)
    r1.broadcast(2)

    clock.tick(100000)

    assert.deepEqual(vs0, [0, 1, 2])
    assert.deepEqual(vs1, [5, 4, 3])
  })

  it("broadcasts & connects", () => {
    let [vs0, r0] = createRouter()
    let [vs1, r1] = createRouter()

    let [_, server] = createRouter()

    server.connect(r0)
    r0.connect(server)

    server.broadcast(0)
    server.broadcast(1)
    server.broadcast(2)

    clock.tick(100000)

    server.connect(r1)
    r1.connect(server)

    clock.tick(100000)

    server.broadcast(4)
    server.broadcast(5)

    clock.tick(100000)

    assert.deepEqual(vs0, [0, 1, 2, 4, 5])
    assert.deepEqual(vs1, [0, 1, 2, 4, 5])
  })
  it("receives from multiple", () => {
    let [_0, r0] = createRouter()
    let [_1, r1] = createRouter()

    let [vs, server] = createRouter()

    server.connect(r0)
    r0.connect(server)

    r0.broadcast(0)

    clock.tick(100000)

    server.connect(r1)
    r1.connect(server)

    r1.broadcast(1)

    clock.tick(100000)

    r0.broadcast(2)

    clock.tick(100000)

    assert.deepEqual(vs, [0, 1, 2])
  })
})
