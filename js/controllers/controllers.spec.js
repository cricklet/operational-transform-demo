/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'

import { TextApplier } from '../ot/applier.js'
import { inferOperation } from '../ot/inferrer.js'
import { generateInsertion, generateDeletion } from '../ot/components.js'

import { ClientController } from './client_controller.js'
import { ServerController, OTDocuments } from './server_controller.js'

import type { ClientUpdatePacket, ServerUpdatePacket } from './types.js'
import { OTHelper } from './ot_helper.js'

function generatePropogator (
  server: ServerController,
  clients: Array<ClientController<*>>
): (update: ?ClientUpdatePacket) => void {
  // This setups a fake network between a server & multiple clients.

  let toServer = []
  let toClients = []

  function propogateBroadcast (serverUpdate: ServerUpdatePacket) {
    let clientUpdates = clients.map(
      client => client.handleUpdate(serverUpdate))

    for (let clientUpdate of clientUpdates) {
      if (clientUpdate) {
        propogateUpdate(clientUpdate)
      }
    }
  }

  function propogateUpdate (clientUpdate: ClientUpdatePacket) {
    let serverUpdate = server.handleUpdate(clientUpdate)
    propogateBroadcast(serverUpdate)
  }

  return (clientUpdate) => {
    if (clientUpdate) propogateUpdate(clientUpdate)
  }
}

let TextOTHelper = new OTHelper(TextApplier)
let DOC_ID = '12345'

describe('Client & Server', () => {
  it('initialize', () => {
    let server = new ServerController(TextOTHelper)
    let client = new ClientController(DOC_ID, TextOTHelper)
  })
  it('one client updates', () => {
    let client = new ClientController(DOC_ID, TextOTHelper)
    client.performEdit(generateInsertion(0, 'hello!'), [])
    assert.equal('hello!', client.state)
  })
  it('one client updates server', () => {
    let server = new ServerController(TextOTHelper)
    let client = new ClientController(DOC_ID, TextOTHelper)

    let propogate = generatePropogator(server, [client])

    let update = client.performEdit(generateInsertion(0, 'hello!'), [])
    propogate(update)

    assert.equal('hello!', client.state)
    assert.equal('hello!', server.state(DOC_ID))
  })
  it ('two clients are handled', () => {
    let server = new ServerController(TextOTHelper)
    let client0 = new ClientController(DOC_ID, TextOTHelper)
    let client1 = new ClientController(DOC_ID, TextOTHelper)

    let propogate = generatePropogator(server, [client0, client1])

    let update0 = client0.performEdit(generateInsertion(0, 'world'), [])

    propogate(update0)

    assert.equal('world', client0.state)
    assert.equal('world', client1.state)
    assert.equal('world', server.state(DOC_ID))
  })
  it ('two clients conflicts are handled', () => {
    let server = new ServerController(TextOTHelper)
    let client0 = new ClientController(DOC_ID, TextOTHelper)
    let client1 = new ClientController(DOC_ID, TextOTHelper)

    let propogate = generatePropogator(server, [client0, client1])

    let update0 = client0.performEdit(generateInsertion(0, 'world'), [])
    let update1 = client1.performEdit(generateInsertion(0, 'hello'), [])

    propogate(update0)
    propogate(update1)

    assert.equal('helloworld', client0.state)
    assert.equal('helloworld', client1.state)
    assert.equal('helloworld', server.state(DOC_ID))
  })
  it ('two clients out of order', () => {
    let server = new ServerController(TextOTHelper)
    let client0 = new ClientController(DOC_ID, TextOTHelper)
    let client1 = new ClientController(DOC_ID, TextOTHelper)

    let propogate = generatePropogator(server, [client0, client1])

    let c1 = client1.performEdit(generateInsertion(0, '01234'), [])
    let c2a = client0.performEdit(generateInsertion(0, 'abc'), [])
    let c2b = client0.performEdit(generateDeletion(0, 3), [])

    propogate(c2a)
    propogate(c2b)
    propogate(c1)

    assert.equal('01234', client0.state)
    assert.equal('01234', client1.state)
    assert.equal('01234', server.state(DOC_ID))
  })
  it ('multiple clients with interleaved requests', () => {
    let client0 = new ClientController(DOC_ID, TextOTHelper)
    let client1 = new ClientController(DOC_ID, TextOTHelper)
    let client2 = new ClientController(DOC_ID, TextOTHelper)

    let clients = [client0, client1, client2]
    let server = new ServerController(TextOTHelper)

    let propogate = generatePropogator(server, clients)

    let request0 = client0.performEdit(generateInsertion(0, 'hello'), [])
    let request1 = client0.performEdit(generateDeletion(2, 3), []) // he

    let request2 = client1.performEdit(generateInsertion(0, 'dog'), [])
    let request3 = client1.performEdit(generateDeletion(0, 1), [])
    let request4 = client1.performEdit(generateInsertion(0, 'g'), [])
    let request5 = client1.performEdit(generateDeletion(2, 1), [])

    let request6 = client1.performEdit(generateInsertion(2, 'd'), []) // god
    let request7 = client2.performEdit(generateInsertion(0, 'le'), [])
    let request8 = client2.performEdit(generateInsertion(2, ' sigh'), []) // le sigh

    assert.equal('he', client0.state)
    assert.equal('god', client1.state)
    assert.equal('le sigh', client2.state)
    assert.equal('', server.state(DOC_ID))

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
    assert.equal('le sighgodhe', server.state(DOC_ID))
  })
})

describe('undo & redo', () => {
  it('undo works for one client', () => {
    let client = new ClientController(DOC_ID, TextOTHelper)

    client.performNullableEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performNullableEdit(inferOperation(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')

    client.performUndo()
    assert.equal(client.state, 'hello')

    client.performUndo()
    assert.equal(client.state, '')

    client.performRedo()
    client.performRedo()
  })

  it('undo redo for one client', () => {
    let client = new ClientController(DOC_ID, TextOTHelper)

    client.performNullableEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performNullableEdit(inferOperation(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')

    client.performUndo()
    assert.equal(client.state, 'hello')

    client.performUndo()
    assert.equal(client.state, '')

    client.performRedo()
    assert.equal(client.state, 'hello')

    client.performRedo()
    assert.equal(client.state, 'hello world')
  })

  it('redo is reset on edit', () => {
    let client = new ClientController(DOC_ID, TextOTHelper)

    client.performNullableEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performNullableEdit(inferOperation(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)

    client.performUndo()
    client.performUndo()
    assert.equal(client.state, '')
    assert.equal(client.undos.operationsStack.length, 0)
    assert.equal(client.redos.operationsStack.length, 2)

    client.performNullableEdit(inferOperation(client.state, 'banana'))
    assert.equal(client.state, 'banana')
    assert.equal(client.undos.operationsStack.length, 1)
    assert.equal(client.redos.operationsStack.length, 0)
  })

  it('undo/redo extra times for one client', () => {
    let client = new ClientController(DOC_ID, TextOTHelper)

    client.performNullableEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performNullableEdit(inferOperation(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)

    client.performUndo()
    assert.equal(client.state, 'hello')
    assert.equal(client.undos.operationsStack.length, 1)
    assert.equal(client.redos.operationsStack.length, 1)

    client.performUndo()
    assert.equal(client.state, '')
    assert.equal(client.undos.operationsStack.length, 0)
    assert.equal(client.redos.operationsStack.length, 2)

    client.performUndo()
    assert.equal(client.state, '')
    assert.equal(client.undos.operationsStack.length, 0)
    assert.equal(client.redos.operationsStack.length, 2)

    client.performRedo()
    assert.equal(client.state, 'hello')
    assert.equal(client.undos.operationsStack.length, 1)
    assert.equal(client.redos.operationsStack.length, 1)

    client.performRedo()
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)

    client.performRedo()
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)
  })

  it('undo works for two clients', () => { // tested on dropbox paper!
    let client0 = new ClientController(DOC_ID, TextOTHelper)
    let client1 = new ClientController(DOC_ID, TextOTHelper)
    let server = new ServerController(TextOTHelper)

    let propogate = generatePropogator(server, [client0, client1])

    propogate(client0.performNullableEdit(inferOperation(client0.state, 'hello')))
    propogate(client1.performNullableEdit(inferOperation(client1.state, 'hellogeorge')))
    propogate(client0.performNullableEdit(inferOperation(client0.state, 'helloworld')))

    assert.equal(client0.state, 'helloworld')
    assert.equal(client1.state, 'helloworld')

    propogate(client1.performUndo())
    assert.equal(client0.state, 'helloworld')
    assert.equal(client1.state, 'helloworld')

    propogate(client0.performUndo())
    assert.equal(client0.state, 'hellogeorge')
    assert.equal(client1.state, 'hellogeorge')

    propogate(client0.performUndo())
    assert.equal(client0.state, 'george')
    assert.equal(client1.state, 'george')
  })

  it('redo works for two clients', () => { // tested on dropbox paper!
    let client0 = new ClientController(DOC_ID, TextOTHelper)
    let client1 = new ClientController(DOC_ID, TextOTHelper)
    let server = new ServerController(TextOTHelper)

    let propogate = generatePropogator(server, [client0, client1])

    let updates = []

    updates.push(client0.performNullableEdit(inferOperation(client0.state, 'hello')))
    updates.push(client0.performNullableEdit(inferOperation(client0.state, 'hello world')))
    updates.push(client0.performNullableEdit(inferOperation(client0.state, 'hi world')))

    updates.push(client1.performNullableEdit(inferOperation(client1.state, 'boop ')))
    updates.push(client1.performNullableEdit(inferOperation(client1.state, 'boop banana ')))

    assert.equal(client0.state, 'hi world')
    assert.equal(client1.state, 'boop banana ')

    for (let u of updates) { propogate(u) }

    assert.equal(client0.state, 'boop banana hi world')
    assert.equal(client1.state, 'boop banana hi world')

    propogate(client1.performUndo())
    propogate(client1.performUndo())
    assert.equal(client0.state, 'hi world')
    assert.equal(client1.state, 'hi world')

    propogate(client1.performRedo())
    propogate(client1.performRedo())
    assert.equal(client0.state, 'boop banana hi world')
    assert.equal(client1.state, 'boop banana hi world')

    propogate(client0.performUndo())
    assert.equal(client0.state, 'boop banana hello world')
    assert.equal(client1.state, 'boop banana hello world')

    propogate(client0.performUndo())
    assert.equal(client0.state, 'boop banana hello')
    assert.equal(client1.state, 'boop banana hello')

    propogate(client0.performUndo())
    assert.equal(client0.state, 'boop banana ')
    assert.equal(client1.state, 'boop banana ')
  })
})
