/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'

import * as U from '../helpers/utils.js'

import { TextApplier } from '../ot/applier.js'
import { inferOperation } from '../ot/inferrer.js'
import { generateInsertion, generateDeletion } from '../ot/components.js'

import { OTClientHelper, OutOfOrderError } from './ot_client_helper.js'
import { OTServerHelper } from './ot_server_helper.js'

import type { ClientEditMessage, ServerEditMessage, ClientRequestHistory } from './message_types.js'
import * as OTHelper from './ot_helper.js'

type Propogator = {
  send: (packet: ?(ClientEditMessage | ClientRequestHistory)) => void,
  connect: (client: OTClientHelper<*>) => void,
  disconnect: (client: OTClientHelper<*>) => void,
}

// Setup a fake network between a server & multiple clients.
function generatePropogator (
  server: OTServerHelper,
  clients: Array<OTClientHelper<*>>
): Propogator {
  function propogate(clientMessage: ?(ClientEditMessage | ClientRequestHistory)) {
    if (clientMessage == null) {
      return
    }

    let sourceUid = clientMessage.sourceUid

    // server responds to this message
    let serverResponses = server.handle(clientMessage)

    // clients then respond to that server response!
    let clientResponses = []

    for (let serverResponse of serverResponses) {
      let relevantClients = []

      if (server.isLatestMessage(serverResponse)) {
        // broadcast to all clients
        relevantClients = clients
      } else {
        // just reply
        relevantClients = U.filter(clients, c => c.uid === sourceUid)
      }

      for (let client of relevantClients) {
        // each client should handle the new server response
        let clientResponse = client.handle(serverResponse)
        if (clientResponse != null) {
          clientResponses.push(clientResponse)
        }
      }
    }

    for (let clientResponse of clientResponses) {
      propogate(clientResponse)
    }
  }

  return {
    send: (data) => {
      propogate(data)
    },
    connect: (client: OTClientHelper<*>) => {
      clients.push(client)
      propogate(client.generateHistoryRequest())
    },
    disconnect: (client: OTClientHelper<*>) => {
      let poppedClient = U.pop(clients, c => c === client)
      if (poppedClient == null) {
        throw new Error('wat')
      }
    }
  }
}

describe('Client & Server', () => {
  it('initialize', () => {
    let server = new OTServerHelper()
    let client = new OTClientHelper(TextApplier)
  })
  it('one client updates', () => {
    let client = new OTClientHelper(TextApplier)
    client.performEdit(generateInsertion(0, 'hello!'))
    assert.equal('hello!', client.state)
  })
  it('one client updates server', () => {
    let server = new OTServerHelper()
    let client = new OTClientHelper(TextApplier)

    let propogate = generatePropogator(server, [client]).send

    let update = client.performEdit(generateInsertion(0, 'hello!'))
    propogate(update)

    assert.equal('hello!', client.state)
    assert.equal('hello!', server.state())
  })
  it('duplicate updates are can be handled idempotently', () => {
    let server = new OTServerHelper()
    let client = new OTClientHelper(TextApplier)

    let propogate = generatePropogator(server, [client]).send

    const update = client.performEdit(generateInsertion(0, 'hello!'))
    if (update == null) { throw new Error('wat') }

    propogate(update)
    assert.equal('hello!', client.state)
    assert.equal('hello!', server.state())

    propogate(update)
    assert.equal('hello!', client.state)
    assert.equal('hello!', server.state())
  })
  it ('two clients are handled', () => {
    let server = new OTServerHelper()
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)

    let propogate = generatePropogator(server, [client0, client1]).send

    let update0 = client0.performEdit(generateInsertion(0, 'world'))

    propogate(update0)

    assert.equal('world', client0.state)
    assert.equal('world', client1.state)
    assert.equal('world', server.state())
  })
  it ('two clients conflicts are handled', () => {
    let server = new OTServerHelper()
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)

    let propogate = generatePropogator(server, [client0, client1]).send

    let update0 = client0.performEdit(generateInsertion(0, 'world'))
    let update1 = client1.performEdit(generateInsertion(0, 'hello'))

    propogate(update0)
    propogate(update1)

    assert.equal('helloworld', client0.state)
    assert.equal('helloworld', client1.state)
    assert.equal('helloworld', server.state())
  })
  it ('two clients out of order', () => {
    let server = new OTServerHelper()
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)

    let propogate = generatePropogator(server, [client0, client1]).send

    let c1 = client1.performEdit(generateInsertion(0, '01234'))
    let c2a = client0.performEdit(generateInsertion(0, 'abc'))
    let c2b = client0.performEdit(generateDeletion(0, 3))

    propogate(c2a)
    propogate(c2b)
    propogate(c1)

    assert.equal('01234', client0.state)
    assert.equal('01234', client1.state)
    assert.equal('01234', server.state())
  })
  it ('multiple clients with interleaved requests', () => {
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)
    let client2 = new OTClientHelper(TextApplier)

    let clients = [client0, client1, client2]
    let server = new OTServerHelper()

    let propogate = generatePropogator(server, clients).send

    let request0 = client0.performEdit(generateInsertion(0, 'hello'))
    let request1 = client0.performEdit(generateDeletion(2, 3)) // he

    let request2 = client1.performEdit(generateInsertion(0, 'dog'))
    let request3 = client1.performEdit(generateDeletion(0, 1))
    let request4 = client1.performEdit(generateInsertion(0, 'g'))
    let request5 = client1.performEdit(generateDeletion(2, 1))

    let request6 = client1.performEdit(generateInsertion(2, 'd')) // god
    let request7 = client2.performEdit(generateInsertion(0, 'le'))
    let request8 = client2.performEdit(generateInsertion(2, ' sigh')) // le sigh

    assert.equal('he', client0.state)
    assert.equal('god', client1.state)
    assert.equal('le sigh', client2.state)
    assert.equal('', server.state())

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
    assert.equal('le sighgodhe', server.state())
  })
})

describe('connection', () => {
  it('clients can be connected late', () => {
    let client = new OTClientHelper(TextApplier)

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    client.performEdit(inferOperation(client.state, 'hello'))
    client.performEdit(inferOperation(client.state, 'hello world'))
    client.performEdit(inferOperation(client.state, 'hello banana world'))
    client.performEdit(inferOperation(client.state, 'hello banana'))

    assert.equal('', server.state())

    propogator.connect(client)
    assert.equal('hello banana', client.state)
    assert.equal('hello banana', server.state())
  })
  it('multiple clients can be connected late', () => {
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    client0.performEdit(inferOperation(client0.state, 'hello'))
    client0.performEdit(inferOperation(client0.state, 'hello world'))
    client0.performEdit(inferOperation(client0.state, 'hello banana world'))
    client0.performEdit(inferOperation(client0.state, 'hello banana'))

    client1.performEdit(inferOperation(client1.state, 'wat'))
    client1.performEdit(inferOperation(client1.state, 'wat is'))
    client1.performEdit(inferOperation(client1.state, 'wat is love'))

    assert.equal('', server.state())

    propogator.connect(client0)
    assert.equal('hello banana', client0.state)
    assert.equal('hello banana', server.state())

    propogator.connect(client1)
    assert.equal('wat is lovehello banana', client0.state)
    assert.equal('wat is lovehello banana', client1.state)
    assert.equal('wat is lovehello banana', server.state())
  })
  it('clients can be disconnected', () => {
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    client0.performEdit(inferOperation(client0.state, 'hello'))
    client0.performEdit(inferOperation(client0.state, 'hello world'))

    client1.performEdit(inferOperation(client1.state, 'wat '))
    client1.performEdit(inferOperation(client1.state, 'wat is '))
    client1.performEdit(inferOperation(client1.state, 'wat is love '))

    assert.equal('', server.state())

    // Connect the clients

    propogator.connect(client0)
    assert.equal('hello world', client0.state)
    assert.equal('hello world', server.state())

    propogator.connect(client1)
    assert.equal('wat is love hello world', client0.state)
    assert.equal('wat is love hello world', client1.state)
    assert.equal('wat is love hello world', server.state())

    // Disconnect one client

    propogator.disconnect(client1)

    // Add updates

    propogator.send(client0.performEdit(inferOperation(client0.state, 'wat is love hello banana')))
    propogator.send(client0.performEdit(inferOperation(client0.state, 'wat is apple hello banana')))

    client1.performEdit(inferOperation(client1.state, 'wat is love hello'))
    client1.performEdit(inferOperation(client1.state, 'wat is love'))
    client1.performEdit(inferOperation(client1.state, 'wat is love baby'))
    client1.performEdit(inferOperation(client1.state, 'wat is love baby dont hurt me '))

    assert.equal('wat is apple hello banana', client0.state)
    assert.equal('wat is love baby dont hurt me ', client1.state) // diverged!
    assert.equal('wat is apple hello banana', server.state())

    // Reconnect

    propogator.connect(client1)

    assert.equal('wat is apple baby dont hurt me banana', client0.state)
    assert.equal('wat is apple baby dont hurt me banana', client1.state)
    assert.equal('wat is apple baby dont hurt me banana', server.state())
  })
})

describe('resend', () => {
  it('dropped updates can be re-sent', () => {
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)
    let client2 = new OTClientHelper(TextApplier)

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    // Connect the clients

    propogator.connect(client0)
    propogator.connect(client1)
    propogator.connect(client2)

    // Edit text, dropping some packets

    propogator.send(client0.performEdit(inferOperation(client0.state, 'hello ')))
    /* DROP THIS */ client0.performEdit(inferOperation(client0.state, 'hello world '))
    propogator.send(client0.performEdit(inferOperation(client0.state, 'hi world ')))

    assert.equal('hi world ', client0.state)
    assert.equal('hello ', client1.state)
    assert.equal('hello ', client2.state)

    propogator.send(client1.performEdit(inferOperation(client1.state, 'hello boop ')))
    propogator.send(client1.performEdit(inferOperation(client1.state, 'hello boop banana ')))
    /* DROP THIS */ client1.performEdit(inferOperation(client1.state, 'hello boop apple '))

    assert.equal('hi world boop banana ', client0.state)
    assert.equal('hello boop apple ', client1.state)
    assert.equal('hello boop banana ', client2.state)

    /* DROP THIS */ client2.performEdit(inferOperation(client2.state, 'hello cranberry '))

    assert.equal('hi world boop banana ', client0.state)
    assert.equal('hello boop apple ', client1.state)
    assert.equal('hello cranberry ', client2.state)

    // Re-send the dropped edits... This would happen on some timeout in an actual client

    propogator.send(client0.getOutstandingMessage())
    propogator.send(client1.getOutstandingMessage())
    propogator.send(client2.getOutstandingMessage())

    assert.equal('hi world cranberryapple ', client0.state)
    assert.equal('hi world cranberryapple ', client1.state)
    assert.equal('hi world cranberryapple ', client2.state)
  })
  it('resend is idempotent', () => {
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    // Connect the clients

    propogator.connect(client0)
    propogator.connect(client1)

    // Edit text, dropping some packets

    propogator.send(client0.performEdit(inferOperation(client0.state, 'hello')))
    /* DROP THIS */ client0.performEdit(inferOperation(client0.state, 'hello world'))

    propogator.send(client1.performEdit(inferOperation(client1.state, 'hello george ')))
    /* DROP THIS */ client1.performEdit(inferOperation(client1.state, 'hello george washington '))

    assert.equal('hello world george ', client0.state)
    assert.equal('hello george washington ', client1.state)

    /* DROP THIS */ client0.getOutstandingMessage()
    /* DROP THIS */ client1.getOutstandingMessage()

    /* DROP THIS */ client0.getOutstandingMessage()
    /* DROP THIS */ client1.getOutstandingMessage()

    propogator.send(client0.getOutstandingMessage())
    propogator.send(client1.getOutstandingMessage())

    assert.equal('hello world george washington ', client0.state)
    assert.equal('hello world george washington ', client1.state)
  })
})

describe('undo & redo', () => {
  it('undo works for one client', () => {
    let client = new OTClientHelper(TextApplier)

    client.performEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performEdit(inferOperation(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')

    client.performUndo()
    assert.equal(client.state, 'hello')

    client.performUndo()
    assert.equal(client.state, '')

    client.performRedo()
    client.performRedo()
  })

  it('undo redo for one client', () => {
    let client = new OTClientHelper(TextApplier)

    client.performEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performEdit(inferOperation(client.state, 'hello world'))
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
    let client = new OTClientHelper(TextApplier)

    client.performEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performEdit(inferOperation(client.state, 'hello world'))
    assert.equal(client.state, 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)

    client.performUndo()
    client.performUndo()
    assert.equal(client.state, '')
    assert.equal(client.undos.operationsStack.length, 0)
    assert.equal(client.redos.operationsStack.length, 2)

    client.performEdit(inferOperation(client.state, 'banana'))
    assert.equal(client.state, 'banana')
    assert.equal(client.undos.operationsStack.length, 1)
    assert.equal(client.redos.operationsStack.length, 0)
  })

  it('undo/redo extra times for one client', () => {
    let client = new OTClientHelper(TextApplier)

    client.performEdit(inferOperation(client.state, 'hello'))
    assert.equal(client.state, 'hello')

    client.performEdit(inferOperation(client.state, 'hello world'))
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
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)
    let server = new OTServerHelper()

    let propogate = generatePropogator(server, [client0, client1]).send

    propogate(client0.performEdit(inferOperation(client0.state, 'hello')))
    propogate(client1.performEdit(inferOperation(client1.state, 'hellogeorge')))
    propogate(client0.performEdit(inferOperation(client0.state, 'helloworld')))

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
    let client0 = new OTClientHelper(TextApplier)
    let client1 = new OTClientHelper(TextApplier)
    let server = new OTServerHelper()

    let propogate = generatePropogator(server, [client0, client1]).send

    let updates = []

    updates.push(client0.performEdit(inferOperation(client0.state, 'hello')))
    updates.push(client0.performEdit(inferOperation(client0.state, 'hello world')))
    updates.push(client0.performEdit(inferOperation(client0.state, 'hi world')))

    updates.push(client1.performEdit(inferOperation(client1.state, 'boop ')))
    updates.push(client1.performEdit(inferOperation(client1.state, 'boop banana ')))

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
