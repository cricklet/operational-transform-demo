/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'
import { map, zip } from 'wu'

import { shuffle, push, concat } from './utils.js'

import {
  Client,
  Server,
  generatePropogator,
} from './new_orchestrator.js'

import {
  generateInsertion,
  generateDeletion,
  LinearOperator,
  TextApplier
} from './text_operations.js'

let operator = new LinearOperator()
let applier = new TextApplier()

describe('Client & Server', () => {
  it('initialize', () => {
    let server = new Server(operator, applier)
    let client = new Client(operator, applier)
  })
  it('one client updates', () => {
    let client = new Client(operator, applier)
    client.handleEdit(generateInsertion(0, 'hello!'))
    assert.equal('hello!', client.state)
  })
  it('one client updates server', () => {
    let server = new Server(operator, applier)
    let client = new Client(operator, applier)

    let propogate = generatePropogator(server, [client])

    let update = client.handleEdit(generateInsertion(0, 'hello!'))
    propogate(update)

    assert.equal('hello!', client.state)
    assert.equal('hello!', server.state)
  })
  it ('two clients are handled', () => {
    let server = new Server(operator, applier)
    let client0 = new Client(operator, applier)
    let client1 = new Client(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    let update0 = client0.handleEdit(generateInsertion(0, 'world'))

    propogate(update0)

    assert.equal('world', client0.state)
    assert.equal('world', client1.state)
    assert.equal('world', server.state)
  })
  it ('two clients conflicts are handled', () => {
    let server = new Server(operator, applier)
    let client0 = new Client(operator, applier)
    let client1 = new Client(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    let update0 = client0.handleEdit(generateInsertion(0, 'world'))
    let update1 = client1.handleEdit(generateInsertion(0, 'hello'))

    propogate(update0)
    propogate(update1)

    assert.equal('helloworld', client0.state)
    assert.equal('helloworld', client1.state)
    assert.equal('helloworld', server.state)
  })
  it ('two clients out of order', () => {
    let server = new Server(operator, applier)
    let client0 = new Client(operator, applier)
    let client1 = new Client(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    let c1 = client1.handleEdit(generateInsertion(0, '01234'))
    let c2a = client0.handleEdit(generateInsertion(0, 'abc'))
    let c2b = client0.handleEdit(generateDeletion(0, 3))

    propogate(c2a)
    propogate(c2b)
    propogate(c1)

    assert.equal('01234', client0.state)
    assert.equal('01234', client1.state)
    assert.equal('01234', server.state)
  })
  it ('multiple clients with interleaved requests', () => {
    let client0 = new Client(operator, applier)
    let client1 = new Client(operator, applier)
    let client2 = new Client(operator, applier)

    let clients = [client0, client1, client2]
    let server = new Server(operator, applier)

    let propogate = generatePropogator(server, clients)

    let request0 = client0.handleEdit(generateInsertion(0, 'hello'))
    let request1 = client0.handleEdit(generateDeletion(2, 3)) // he

    let request2 = client1.handleEdit(generateInsertion(0, 'dog'))
    let request3 = client1.handleEdit(generateDeletion(0, 1))
    let request4 = client1.handleEdit(generateInsertion(0, 'g'))
    let request5 = client1.handleEdit(generateDeletion(2, 1))

    let request6 = client1.handleEdit(generateInsertion(2, 'd')) // god
    let request7 = client2.handleEdit(generateInsertion(0, 'le'))
    let request8 = client2.handleEdit(generateInsertion(2, ' sigh')) // le sigh

    assert.equal('he', client0.state)
    assert.equal('god', client1.state)
    assert.equal('le sigh', client2.state)
    assert.equal('', server.state)

    propogate(request0)
    propogate(request2)
    propogate(request6)
    propogate(request1)
    propogate(request3)
    propogate(request7)
    propogate(request8)
    propogate(request4)
    propogate(request5)

    assert.equal('le sighgodhe', client0.state)
    assert.equal('le sighgodhe', client1.state)
    assert.equal('le sighgodhe', client2.state)
    assert.equal('le sighgodhe', server.state)
  })
})
