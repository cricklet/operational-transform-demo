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
  OTClient,
  OTServer,
  generatePropogator,
} from './new_orchestrator.js'

import {
  Operator,
  TextApplier,
  TextInferrer,
  generateInsertion,
  generateDeletion
} from './text_operations.js'

let operator = new Operator()
let applier = new TextApplier()
let inferrer = new TextInferrer()

describe('Client & Server', () => {
  it('initialize', () => {
    let server = new OTServer(operator, applier)
    let client = new OTClient(operator, applier)
  })
  it('one client updates', () => {
    let client = new OTClient(operator, applier)
    client.handleEdit(generateInsertion(0, 'hello!'), [])
    assert.equal('hello!', client.state)
  })
  it('one client updates server', () => {
    let server = new OTServer(operator, applier)
    let client = new OTClient(operator, applier)

    let propogate = generatePropogator(server, [client])

    let update = client.handleEdit(generateInsertion(0, 'hello!'), [])
    propogate(update)

    assert.equal('hello!', client.state)
    assert.equal('hello!', server.state)
  })
  it ('two clients are handled', () => {
    let server = new OTServer(operator, applier)
    let client0 = new OTClient(operator, applier)
    let client1 = new OTClient(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    let update0 = client0.handleEdit(generateInsertion(0, 'world'), [])

    propogate(update0)

    assert.equal('world', client0.state)
    assert.equal('world', client1.state)
    assert.equal('world', server.state)
  })
  it ('two clients conflicts are handled', () => {
    let server = new OTServer(operator, applier)
    let client0 = new OTClient(operator, applier)
    let client1 = new OTClient(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    let update0 = client0.handleEdit(generateInsertion(0, 'world'), [])
    let update1 = client1.handleEdit(generateInsertion(0, 'hello'), [])

    propogate(update0)
    propogate(update1)

    assert.equal('helloworld', client0.state)
    assert.equal('helloworld', client1.state)
    assert.equal('helloworld', server.state)
  })
  it ('two clients out of order', () => {
    let server = new OTServer(operator, applier)
    let client0 = new OTClient(operator, applier)
    let client1 = new OTClient(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    let c1 = client1.handleEdit(generateInsertion(0, '01234'), [])
    let c2a = client0.handleEdit(generateInsertion(0, 'abc'), [])
    let c2b = client0.handleEdit(generateDeletion(0, 3), [])

    propogate(c2a)
    propogate(c2b)
    propogate(c1)

    assert.equal('01234', client0.state)
    assert.equal('01234', client1.state)
    assert.equal('01234', server.state)
  })
  it ('multiple clients with interleaved requests', () => {
    let client0 = new OTClient(operator, applier)
    let client1 = new OTClient(operator, applier)
    let client2 = new OTClient(operator, applier)

    let clients = [client0, client1, client2]
    let server = new OTServer(operator, applier)

    let propogate = generatePropogator(server, clients)

    let request0 = client0.handleEdit(generateInsertion(0, 'hello'), [])
    let request1 = client0.handleEdit(generateDeletion(2, 3), []) // he

    let request2 = client1.handleEdit(generateInsertion(0, 'dog'), [])
    let request3 = client1.handleEdit(generateDeletion(0, 1), [])
    let request4 = client1.handleEdit(generateInsertion(0, 'g'), [])
    let request5 = client1.handleEdit(generateDeletion(2, 1), [])

    let request6 = client1.handleEdit(generateInsertion(2, 'd'), []) // god
    let request7 = client2.handleEdit(generateInsertion(0, 'le'), [])
    let request8 = client2.handleEdit(generateInsertion(2, ' sigh'), []) // le sigh

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

describe('undo & redo', () => {
  it('undo works for one client', () => {
    let client = new OTClient(operator, applier)

    client.handleNullableEdit(inferrer.infer(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.handleNullableEdit(inferrer.infer(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')

    client.handleUndo()
    assert.equal(client.state, 'hello')

    client.handleUndo()
    assert.equal(client.state, '')

    client.handleRedo()
    client.handleRedo()
  })

  it('undo redo for one client', () => {
    let client = new OTClient(operator, applier)

    client.handleNullableEdit(inferrer.infer(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.handleNullableEdit(inferrer.infer(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')

    client.handleUndo()
    assert.equal(client.state, 'hello')

    client.handleUndo()
    assert.equal(client.state, '')

    client.handleRedo()
    assert.equal(client.state, 'hello')

    client.handleRedo()
    assert.equal(client.state, 'hello world')
  })

  it('redo is reset on edit', () => {
    let client = new OTClient(operator, applier)

    client.handleNullableEdit(inferrer.infer(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.handleNullableEdit(inferrer.infer(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.opsStack.length, 2)
    assert.equal(client.redos.opsStack.length, 0)

    client.handleUndo()
    client.handleUndo()
    assert.equal(client.state, '')
    assert.equal(client.undos.opsStack.length, 0)
    assert.equal(client.redos.opsStack.length, 2)

    client.handleNullableEdit(inferrer.infer(client.state, 'banana'))
    assert.equal(client.state, 'banana')
    assert.equal(client.undos.opsStack.length, 1)
    assert.equal(client.redos.opsStack.length, 0)
  })

  it('undo/redo extra times for one client', () => {
    let client = new OTClient(operator, applier)

    client.handleNullableEdit(inferrer.infer(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.handleNullableEdit(inferrer.infer(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.opsStack.length, 2)
    assert.equal(client.redos.opsStack.length, 0)

    client.handleUndo()
    assert.equal(client.state, 'hello')
    assert.equal(client.undos.opsStack.length, 1)
    assert.equal(client.redos.opsStack.length, 1)

    client.handleUndo()
    assert.equal(client.state, '')
    assert.equal(client.undos.opsStack.length, 0)
    assert.equal(client.redos.opsStack.length, 2)

    client.handleUndo()
    assert.equal(client.state, '')
    assert.equal(client.undos.opsStack.length, 0)
    assert.equal(client.redos.opsStack.length, 2)

    client.handleRedo()
    assert.equal(client.state, 'hello')
    assert.equal(client.undos.opsStack.length, 1)
    assert.equal(client.redos.opsStack.length, 1)

    client.handleRedo()
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.opsStack.length, 2)
    assert.equal(client.redos.opsStack.length, 0)

    client.handleRedo()
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.opsStack.length, 2)
    assert.equal(client.redos.opsStack.length, 0)
  })

  it('undo works for two clients', () => { // tested on dropbox paper!
    let client0 = new OTClient(operator, applier)
    let client1 = new OTClient(operator, applier)
    let server = new OTServer(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    propogate(client0.handleNullableEdit(inferrer.infer(client0.state, 'hello')))
    propogate(client1.handleNullableEdit(inferrer.infer(client1.state, 'hellogeorge')))
    propogate(client0.handleNullableEdit(inferrer.infer(client0.state, 'helloworld')))

    assert.equal(client0.state, 'helloworld')
    assert.equal(client1.state, 'helloworld')

    propogate(client1.handleUndo())
    assert.equal(client0.state, 'helloworld')
    assert.equal(client1.state, 'helloworld')

    propogate(client0.handleUndo())
    assert.equal(client0.state, 'hellogeorge')
    assert.equal(client1.state, 'hellogeorge')

    propogate(client0.handleUndo())
    assert.equal(client0.state, 'george')
    assert.equal(client1.state, 'george')
  })

  it('redo works for two clients', () => { // tested on dropbox paper!
    let client0 = new OTClient(operator, applier)
    let client1 = new OTClient(operator, applier)
    let server = new OTServer(operator, applier)

    let propogate = generatePropogator(server, [client0, client1])

    let updates = []

    updates.push(client0.handleNullableEdit(inferrer.infer(client0.state, 'hello')))
    updates.push(client0.handleNullableEdit(inferrer.infer(client0.state, 'hello world')))
    updates.push(client0.handleNullableEdit(inferrer.infer(client0.state, 'hi world')))

    updates.push(client1.handleNullableEdit(inferrer.infer(client1.state, 'boop ')))
    updates.push(client1.handleNullableEdit(inferrer.infer(client1.state, 'boop banana ')))

    assert.equal(client0.state, 'hi world')
    assert.equal(client1.state, 'boop banana ')

    for (let u of updates) { propogate(u) }

    assert.equal(client0.state, 'boop banana hi world')
    assert.equal(client1.state, 'boop banana hi world')

    propogate(client1.handleUndo())
    propogate(client1.handleUndo())
    assert.equal(client0.state, 'hi world')
    assert.equal(client1.state, 'hi world')

    propogate(client1.handleRedo())
    propogate(client1.handleRedo())
    assert.equal(client0.state, 'boop banana hi world')
    assert.equal(client1.state, 'boop banana hi world')

    propogate(client0.handleUndo())
    assert.equal(client0.state, 'boop banana hello world')
    assert.equal(client1.state, 'boop banana hello world')

    propogate(client0.handleUndo())
    assert.equal(client0.state, 'boop banana hello')
    assert.equal(client1.state, 'boop banana hello')

    propogate(client0.handleUndo())
    assert.equal(client0.state, 'boop banana ')
    assert.equal(client1.state, 'boop banana ')
  })
})
