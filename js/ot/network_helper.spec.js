/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy, useFakeTimers } from 'sinon'

import { assert } from 'chai'
import { map, zip } from 'wu'

import { shuffle, push, concat } from './utils.js'
import { SimulatedRouter } from './network_helper.js'

describe("SimulatedRouter", () => {
  let clock

  beforeEach(function() {
    clock = useFakeTimers()
  })

  afterEach(function() {
    clock.restore()
  })

  it("sends", () => {
    let vs0: number[] = []
    let vs1: string[] = []

    let r0: SimulatedRouter<string, number> = new SimulatedRouter(
      (v: number) => { vs0.push(v) },
      1000,
      0.5)

    let r1: SimulatedRouter<number, string> = new SimulatedRouter(
      (v: string) => { vs1.push(v) },
      1000,
      0.5)

    r0.connect(r1)
    r1.connect(r0)

    r0.send('a')
    r0.send('b')
    r0.send('c')

    r1.send(0)
    r1.send(1)
    r1.send(2)

    clock.tick(100000)

    assert.deepEqual(vs0, [0, 1, 2])
    assert.deepEqual(vs1, ['a', 'b', 'c'])
  })
})
