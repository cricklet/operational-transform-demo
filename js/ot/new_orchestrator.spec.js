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
  LinearOperator,
  TextApplier,
  TextInferrer,
  generateInsertion,
  generateDeletion
} from './text_operations.js'

import type { TextOperation } from './text_operations.js'

let operator = new LinearOperator()
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

describe('undo', () => {
  it('works for one client', () => {
    let client = new OTClient(operator, applier)

    let edit0 = inferrer.infer(client.state, 'hello')
    if (edit0 == null) throw new Error('wat')
    client.handleEdit(edit0)
    assert.equal(client.state, 'hello')

    let edit1 = inferrer.infer(client.state, 'hello world')
    if (edit1 == null) throw new Error('wat')
    client.handleEdit(edit1)
    assert.equal(client.state, 'hello world')

    client.handleUndo()
    assert.equal(client.state, 'hello')

    client.handleUndo()
    assert.equal(client.state, '')
  })

  it('works for two clients', () => { // tested on dropbox paper!
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

  ;[
    {
      applyStates: [
        [
          'hello',
          'hello world',
          'hi world',
          'hi kenrick'
        ],
        [
          'boop',
          'boop banana '
        ]
      ],
      appliedState: 'boop banana hi kenrick',
      undoStates: [
        [
          'boop banana hi world',
          'boop banana hello world',
          'boop banana hello',
          'boop banana ',
        ],
        [
          'boop',
          '',
        ]
      ],
    },
    {
      applyStates: [
        [
          'hello',
          'hello world',
          'hi world',
          'hi kenrick'
        ]
      ],
      appliedState: 'hi kenrick',
      undoStates: [
        [
          'hi world',
          'hello world',
          'hello',
          '',
        ]
      ]
    }
  ].forEach((test) => {
    it(test.appliedState + ' works', () => {
      let clients = test.applyStates.map(() => new OTClient(operator, applier))
      let server = new OTServer(operator, applier)

      let propogate = generatePropogator(server, clients)
      let updates = []

      for (let [client, states] of zip(clients, test.applyStates)) {
        for (let state of states) {
          let edit = inferrer.infer(client.state, state)
          if (edit == null) {throw new Error('wat')}

          let update = client.handleEdit(edit)
          updates.push(update)

          assert.equal(client.state, state)
        }
      }

      for (let update of updates) {
        propogate(update)
      }

      for (let client of clients) {
        assert.equal(client.state, test.appliedState)
      }

      for (let [client, states] of zip(clients, test.undoStates)) {
        for (let state of states) {
          propogate(client.handleUndo())
          assert.equal(client.state, state)

          for (let other of clients) {
            assert.equal(other.state, state)
          }
        }
      }
    })
  })
})
