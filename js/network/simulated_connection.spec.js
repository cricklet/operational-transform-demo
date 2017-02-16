/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy, useFakeTimers } from 'sinon'

import { assert } from 'chai'
import { map, zip } from 'wu'

import * as U from '../helpers/utils.js'
import { SimulatedConnection } from './simulated_connection.js'

describe("SimulatedConnection", () => {
  let clock

  beforeEach(function() {
    clock = useFakeTimers()
  })

  afterEach(function() {
    clock.restore()
  })

  function createRouter() {
    let vs: number[] = []
    let r: SimulatedConnection<number, number> = new SimulatedConnection(
      { minDelay: 1000, maxDelay: 2000, dropPercentage: 0.5 },
      s => {})
    r.listen((v: number) => { vs.push(v) })

    return [vs, r]
  }

  it("sends", () => {
    let [vs0, r0] = createRouter()
    let [vs1, r1] = createRouter()

    r0.connect(r1)
    r1.connect(r0)

    r0.send(5)
    r0.send(4)
    r0.send(3)

    r1.send(0)
    r1.send(1)
    r1.send(2)

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

    server.send(0)
    server.send(1)
    server.send(2)

    clock.tick(100000)

    server.connect(r1)
    r1.connect(server)

    clock.tick(100000)

    server.send(4)
    server.send(5)

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

    r0.send(0)

    clock.tick(100000)

    server.connect(r1)
    r1.connect(server)

    r1.send(1)

    clock.tick(100000)

    r0.send(2)

    clock.tick(100000)

    assert.deepEqual(vs, [0, 1, 2])
  })
})
