/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'

import * as U from '../helpers/utils.js'

import { inferOperation } from '../ot/inferrer.js'
import { generateInsertion, generateDeletion } from '../ot/components.js'

import { TextDocument } from '../ot/document.js'

import { OTClientHelper } from './ot_client_helper.js'
import { OTServerHelper } from './ot_server_helper.js'

import type { ClientUpdateEvent, ServerUpdateEvent, ClientRequestSetupEvent, ServerFinishSetupEvent } from './types.js'
import * as OTHelper from './ot_helper.js'

type Propogator = {
  send: (packet: ?(ClientUpdateEvent | ClientRequestSetupEvent)) => void,
  connect: (client: OTClientHelper<*>) => void,
  disconnect: (client: OTClientHelper<*>) => void,
}

// Setup a fake network between a server & multiple clients.
function generatePropogator (
  server: OTServerHelper,
  clients: Array<OTClientHelper<*>>,
  _opts?: {
    allowUnordered?: boolean
  }
): Propogator {
  let opts = U.fillDefaults(_opts, { allowUnordered: false })

  function broadcastToClients (serverUpdate: ServerUpdateEvent) {
    let clientResponses
    if (opts.allowUnordered) {
      clientResponses = clients.map(client => client.handleUpdate(serverUpdate))
    } else {
      clientResponses = clients.map(client => client.handleOrderedUpdate(serverUpdate))
    }

    for (const clientResponse of clientResponses) {
      if (clientResponse == null) {
      } else if (clientResponse.kind === 'ClientUpdateEvent') {
        sendUpdateToServer(clientResponse)
      } else if (clientResponse.kind === 'ClientRequestSetupEvent') {
        connectToServer(clientResponse)
      }
    }
  }

  function sendUpdateToServer (clientUpdate: ClientUpdateEvent) {
    let serverUpdate = server.handleUpdate(clientUpdate)
    broadcastToClients(serverUpdate)
  }

  function connectToServer (connectionRequest: ClientRequestSetupEvent) {
    let clientUid = connectionRequest.sourceUid
    let client = U.find(c => c.uid === clientUid, clients)

    if (client == null) {
      throw new Error('wat, client doesn\'t exist')
    }

    let [serverResetResponse, serverUpdate] = server.handleConnection(connectionRequest)

    if (serverUpdate != null) {
      broadcastToClients(serverUpdate)
    }

    const clientResponses = client.handleConnection(serverResetResponse)
    for (let clientResponse of clientResponses) {
      if (clientResponse == null) {
      } else if (clientResponse.kind === 'ClientUpdateEvent') {
        sendUpdateToServer(clientResponse)
      } else if (clientResponse.kind === 'ClientRequestSetupEvent') {
        connectToServer(clientResponse)
      }
    }
  }

  return {
    send: (data) => {
      if (data == null) {
      } else if (data.kind === 'ClientUpdateEvent') {
        sendUpdateToServer(data)
      } else if (data.kind === 'ClientRequestSetupEvent') {
        connectToServer(data)
      }
    },
    connect: (client: OTClientHelper<*>) => {
      clients.push(client)
      connectToServer(client.establishConnection())
    },
    disconnect: (client: OTClientHelper<*>) => {
      let poppedClient = U.pop(clients, c => c === client)
      if (poppedClient == null) {
        throw new Error('wat')
      }
    }
  }
}

let DOC_ID = '12345'

describe('Client & Server', () => {
  it('initialize', () => {
    let server = new OTServerHelper()
    let client = new OTClientHelper(DOC_ID, new TextDocument())
  })
  it('one client updates', () => {
    let client = new OTClientHelper(DOC_ID, new TextDocument())
    client.performEdit(generateInsertion(0, 'hello!'), [])
    assert.equal('hello!', client.doc.getText())
  })
  it('one client updates server', () => {
    let server = new OTServerHelper()
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    let propogate = generatePropogator(server, [client]).send

    let update = client.performEdit(generateInsertion(0, 'hello!'), [])
    propogate(update)

    assert.equal('hello!', client.doc.getText())
    assert.equal('hello!', server.state(DOC_ID))
  })
  it('duplicate updates are can be handled idempotently', () => {
    let server = new OTServerHelper()
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    let propogate = generatePropogator(server, [client], { allowUnordered: true }).send

    const update = client.performEdit(generateInsertion(0, 'hello!'), [])
    if (update == null) { throw new Error('wat') }

    propogate(update)
    assert.equal('hello!', client.doc.getText())
    assert.equal('hello!', server.state(DOC_ID))

    propogate(update)
    assert.equal('hello!', client.doc.getText())
    assert.equal('hello!', server.state(DOC_ID))
  })
  it('duplicate updates are rejected if we enforce ordering', () => {
    let server = new OTServerHelper()
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    let propogate = generatePropogator(server, [client], { allowUnordered: false }).send

    const update = client.performEdit(generateInsertion(0, 'hello!'), [])
    if (update == null) { throw new Error('wat') }

    propogate(update)
    assert.throws(() => propogate(update))
  })
  it ('two clients are handled', () => {
    let server = new OTServerHelper()
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())

    let propogate = generatePropogator(server, [client0, client1]).send

    let update0 = client0.performEdit(generateInsertion(0, 'world'), [])

    propogate(update0)

    assert.equal('world', client0.doc.getText())
    assert.equal('world', client1.doc.getText())
    assert.equal('world', server.state(DOC_ID))
  })
  it ('two clients conflicts are handled', () => {
    let server = new OTServerHelper()
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())

    let propogate = generatePropogator(server, [client0, client1]).send

    let update0 = client0.performEdit(generateInsertion(0, 'world'), [])
    let update1 = client1.performEdit(generateInsertion(0, 'hello'), [])

    propogate(update0)
    propogate(update1)

    assert.equal('helloworld', client0.doc.getText())
    assert.equal('helloworld', client1.doc.getText())
    assert.equal('helloworld', server.state(DOC_ID))
  })
  it ('two clients out of order', () => {
    let server = new OTServerHelper()
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())

    let propogate = generatePropogator(server, [client0, client1]).send

    let c1 = client1.performEdit(generateInsertion(0, '01234'), [])
    let c2a = client0.performEdit(generateInsertion(0, 'abc'), [])
    let c2b = client0.performEdit(generateDeletion(0, 3), [])

    propogate(c2a)
    propogate(c2b)
    propogate(c1)

    assert.equal('01234', client0.doc.getText())
    assert.equal('01234', client1.doc.getText())
    assert.equal('01234', server.state(DOC_ID))
  })
  it ('multiple clients with interleaved requests', () => {
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())
    let client2 = new OTClientHelper(DOC_ID, new TextDocument())

    let clients = [client0, client1, client2]
    let server = new OTServerHelper()

    let propogate = generatePropogator(server, clients).send

    let request0 = client0.performEdit(generateInsertion(0, 'hello'), [])
    let request1 = client0.performEdit(generateDeletion(2, 3), []) // he

    let request2 = client1.performEdit(generateInsertion(0, 'dog'), [])
    let request3 = client1.performEdit(generateDeletion(0, 1), [])
    let request4 = client1.performEdit(generateInsertion(0, 'g'), [])
    let request5 = client1.performEdit(generateDeletion(2, 1), [])

    let request6 = client1.performEdit(generateInsertion(2, 'd'), []) // god
    let request7 = client2.performEdit(generateInsertion(0, 'le'), [])
    let request8 = client2.performEdit(generateInsertion(2, ' sigh'), []) // le sigh

    assert.equal('he', client0.doc.getText())
    assert.equal('god', client1.doc.getText())
    assert.equal('le sigh', client2.doc.getText())
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

    assert.equal('le sighgodhe', client0.doc.getText())
    assert.equal('le sighgodhe', client1.doc.getText())
    assert.equal('le sighgodhe', client2.doc.getText())
    assert.equal('le sighgodhe', server.state(DOC_ID))
  })
})

describe('connection', () => {
  it('clients can be connected late', () => {
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    client.performEdit(inferOperation(client.doc.getText(), 'hello'))
    client.performEdit(inferOperation(client.doc.getText(), 'hello world'))
    client.performEdit(inferOperation(client.doc.getText(), 'hello banana world'))
    client.performEdit(inferOperation(client.doc.getText(), 'hello banana'))

    assert.equal('', server.state(DOC_ID))

    propogator.connect(client)
    assert.equal('hello banana', client.doc.getText())
    assert.equal('hello banana', server.state(DOC_ID))
  })
  it('multiple clients can be connected late', () => {
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    client0.performEdit(inferOperation(client0.doc.getText(), 'hello'))
    client0.performEdit(inferOperation(client0.doc.getText(), 'hello world'))
    client0.performEdit(inferOperation(client0.doc.getText(), 'hello banana world'))
    client0.performEdit(inferOperation(client0.doc.getText(), 'hello banana'))

    client1.performEdit(inferOperation(client1.doc.getText(), 'wat'))
    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is'))
    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is love'))

    assert.equal('', server.state(DOC_ID))

    propogator.connect(client0)
    assert.equal('hello banana', client0.doc.getText())
    assert.equal('hello banana', server.state(DOC_ID))

    propogator.connect(client1)
    assert.equal('wat is lovehello banana', client0.doc.getText())
    assert.equal('wat is lovehello banana', client1.doc.getText())
    assert.equal('wat is lovehello banana', server.state(DOC_ID))
  })
  it('clients can be disconnected', () => {
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    client0.performEdit(inferOperation(client0.doc.getText(), 'hello'))
    client0.performEdit(inferOperation(client0.doc.getText(), 'hello world'))

    client1.performEdit(inferOperation(client1.doc.getText(), 'wat '))
    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is '))
    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is love '))

    assert.equal('', server.state(DOC_ID))

    // Connect the clients

    propogator.connect(client0)
    assert.equal('hello world', client0.doc.getText())
    assert.equal('hello world', server.state(DOC_ID))

    propogator.connect(client1)
    assert.equal('wat is love hello world', client0.doc.getText())
    assert.equal('wat is love hello world', client1.doc.getText())
    assert.equal('wat is love hello world', server.state(DOC_ID))

    // Disconnect one client

    propogator.disconnect(client1)

    // Add updates

    propogator.send(client0.performEdit(inferOperation(client0.doc.getText(), 'wat is love hello banana')))
    propogator.send(client0.performEdit(inferOperation(client0.doc.getText(), 'wat is apple hello banana')))

    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is love hello'))
    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is love'))
    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is love baby'))
    client1.performEdit(inferOperation(client1.doc.getText(), 'wat is love baby dont hurt me '))

    assert.equal('wat is apple hello banana', client0.doc.getText())
    assert.equal('wat is love baby dont hurt me ', client1.doc.getText()) // diverged!
    assert.equal('wat is apple hello banana', server.state(DOC_ID))

    // Reconnect

    propogator.connect(client1)

    assert.equal('wat is apple baby dont hurt me banana', client0.doc.getText())
    assert.equal('wat is apple baby dont hurt me banana', client1.doc.getText())
    assert.equal('wat is apple baby dont hurt me banana', server.state(DOC_ID))
  })
})

describe('resend', () => {
  it('dropped updates can be re-sent', () => {
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())
    let client2 = new OTClientHelper(DOC_ID, new TextDocument())

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    // Connect the clients

    propogator.connect(client0)
    propogator.connect(client1)
    propogator.connect(client2)

    // Edit text, dropping some packets

    propogator.send(client0.performEdit(inferOperation(client0.doc.getText(), 'hello ')))
    /* DROP THIS */ client0.performEdit(inferOperation(client0.doc.getText(), 'hello world '))
    propogator.send(client0.performEdit(inferOperation(client0.doc.getText(), 'hi world ')))

    assert.equal('hi world ', client0.doc.getText())
    assert.equal('hello ', client1.doc.getText())
    assert.equal('hello ', client2.doc.getText())

    propogator.send(client1.performEdit(inferOperation(client1.doc.getText(), 'hello boop ')))
    propogator.send(client1.performEdit(inferOperation(client1.doc.getText(), 'hello boop banana ')))
    /* DROP THIS */ client1.performEdit(inferOperation(client1.doc.getText(), 'hello boop apple '))

    assert.equal('hi world boop banana ', client0.doc.getText())
    assert.equal('hello boop apple ', client1.doc.getText())
    assert.equal('hello boop banana ', client2.doc.getText())

    /* DROP THIS */ client2.performEdit(inferOperation(client2.doc.getText(), 'hello cranberry '))

    assert.equal('hi world boop banana ', client0.doc.getText())
    assert.equal('hello boop apple ', client1.doc.getText())
    assert.equal('hello cranberry ', client2.doc.getText())

    // Re-send the dropped edits... This would happen on some timeout in an actual client

    propogator.send(client0.resendEdits())
    propogator.send(client1.resendEdits())
    propogator.send(client2.resendEdits())

    assert.equal('hi world cranberryapple ', client0.doc.getText())
    assert.equal('hi world cranberryapple ', client1.doc.getText())
    assert.equal('hi world cranberryapple ', client2.doc.getText())
  })
  it('resend is idempotent', () => {
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())

    let server = new OTServerHelper()
    let propogator = generatePropogator(server, [], { allowUnordered: true })

    // Connect the clients

    propogator.connect(client0)
    propogator.connect(client1)

    // Edit text, dropping some packets

    propogator.send(client0.performEdit(inferOperation(client0.doc.getText(), 'hello')))
    /* DROP THIS */ client0.performEdit(inferOperation(client0.doc.getText(), 'hello world'))

    propogator.send(client1.performEdit(inferOperation(client1.doc.getText(), 'hello george ')))
    /* DROP THIS */ client1.performEdit(inferOperation(client1.doc.getText(), 'hello george washington '))

    assert.equal('hello world george ', client0.doc.getText())
    assert.equal('hello george washington ', client1.doc.getText())

    /* DROP THIS */ client0.resendEdits()
    /* DROP THIS */ client1.resendEdits()

    /* DROP THIS */ client0.resendEdits()
    /* DROP THIS */ client1.resendEdits()

    propogator.send(client0.resendEdits())
    propogator.send(client1.resendEdits())

    assert.equal('hello world george washington ', client0.doc.getText())
    assert.equal('hello world george washington ', client1.doc.getText())
  })
})

describe('undo & redo', () => {
  it('undo works for one client', () => {
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    client.performEdit(inferOperation(client.doc.getText(), 'hello'))
    assert.equal(client.doc.getText(), 'hello')

    client.performEdit(inferOperation(client.doc.getText(), 'hello world'))
    assert.equal(client.doc.getText(), 'hello world')

    client.performUndo()
    assert.equal(client.doc.getText(), 'hello')

    client.performUndo()
    assert.equal(client.doc.getText(), '')

    client.performRedo()
    client.performRedo()
  })

  it('undo redo for one client', () => {
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    client.performEdit(inferOperation(client.doc.getText(), 'hello'))
    assert.equal(client.doc.getText(), 'hello')

    client.performEdit(inferOperation(client.doc.getText(), 'hello world'))
    assert.equal(client.doc.getText(), 'hello world')

    client.performUndo()
    assert.equal(client.doc.getText(), 'hello')

    client.performUndo()
    assert.equal(client.doc.getText(), '')

    client.performRedo()
    assert.equal(client.doc.getText(), 'hello')

    client.performRedo()
    assert.equal(client.doc.getText(), 'hello world')
  })

  it('redo is reset on edit', () => {
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    client.performEdit(inferOperation(client.doc.getText(), 'hello'))
    assert.equal(client.doc.getText(), 'hello')

    client.performEdit(inferOperation(client.doc.getText(), 'hello world'))
    assert.equal(client.doc.getText(), 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)

    client.performUndo()
    client.performUndo()
    assert.equal(client.doc.getText(), '')
    assert.equal(client.undos.operationsStack.length, 0)
    assert.equal(client.redos.operationsStack.length, 2)

    client.performEdit(inferOperation(client.doc.getText(), 'banana'))
    assert.equal(client.doc.getText(), 'banana')
    assert.equal(client.undos.operationsStack.length, 1)
    assert.equal(client.redos.operationsStack.length, 0)
  })

  it('undo/redo extra times for one client', () => {
    let client = new OTClientHelper(DOC_ID, new TextDocument())

    client.performEdit(inferOperation(client.doc.getText(), 'hello'))
    assert.equal(client.doc.getText(), 'hello')

    client.performEdit(inferOperation(client.doc.getText(), 'hello world'))
    assert.equal(client.doc.getText(), 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)

    client.performUndo()
    assert.equal(client.doc.getText(), 'hello')
    assert.equal(client.undos.operationsStack.length, 1)
    assert.equal(client.redos.operationsStack.length, 1)

    client.performUndo()
    assert.equal(client.doc.getText(), '')
    assert.equal(client.undos.operationsStack.length, 0)
    assert.equal(client.redos.operationsStack.length, 2)

    client.performUndo()
    assert.equal(client.doc.getText(), '')
    assert.equal(client.undos.operationsStack.length, 0)
    assert.equal(client.redos.operationsStack.length, 2)

    client.performRedo()
    assert.equal(client.doc.getText(), 'hello')
    assert.equal(client.undos.operationsStack.length, 1)
    assert.equal(client.redos.operationsStack.length, 1)

    client.performRedo()
    assert.equal(client.doc.getText(), 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)

    client.performRedo()
    assert.equal(client.doc.getText(), 'hello world')
    assert.equal(client.undos.operationsStack.length, 2)
    assert.equal(client.redos.operationsStack.length, 0)
  })

  it('undo works for two clients', () => { // tested on dropbox paper!
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())
    let server = new OTServerHelper()

    let propogate = generatePropogator(server, [client0, client1]).send

    propogate(client0.performEdit(inferOperation(client0.doc.getText(), 'hello')))
    propogate(client1.performEdit(inferOperation(client1.doc.getText(), 'hellogeorge')))
    propogate(client0.performEdit(inferOperation(client0.doc.getText(), 'helloworld')))

    assert.equal(client0.doc.getText(), 'helloworld')
    assert.equal(client1.doc.getText(), 'helloworld')

    propogate(client1.performUndo())
    assert.equal(client0.doc.getText(), 'helloworld')
    assert.equal(client1.doc.getText(), 'helloworld')

    propogate(client0.performUndo())
    assert.equal(client0.doc.getText(), 'hellogeorge')
    assert.equal(client1.doc.getText(), 'hellogeorge')

    propogate(client0.performUndo())
    assert.equal(client0.doc.getText(), 'george')
    assert.equal(client1.doc.getText(), 'george')
  })

  it('redo works for two clients', () => { // tested on dropbox paper!
    let client0 = new OTClientHelper(DOC_ID, new TextDocument())
    let client1 = new OTClientHelper(DOC_ID, new TextDocument())
    let server = new OTServerHelper()

    let propogate = generatePropogator(server, [client0, client1]).send

    let updates = []

    updates.push(client0.performEdit(inferOperation(client0.doc.getText(), 'hello')))
    updates.push(client0.performEdit(inferOperation(client0.doc.getText(), 'hello world')))
    updates.push(client0.performEdit(inferOperation(client0.doc.getText(), 'hi world')))

    updates.push(client1.performEdit(inferOperation(client1.doc.getText(), 'boop ')))
    updates.push(client1.performEdit(inferOperation(client1.doc.getText(), 'boop banana ')))

    assert.equal(client0.doc.getText(), 'hi world')
    assert.equal(client1.doc.getText(), 'boop banana ')

    for (let u of updates) { propogate(u) }

    assert.equal(client0.doc.getText(), 'boop banana hi world')
    assert.equal(client1.doc.getText(), 'boop banana hi world')

    propogate(client1.performUndo())
    propogate(client1.performUndo())
    assert.equal(client0.doc.getText(), 'hi world')
    assert.equal(client1.doc.getText(), 'hi world')

    propogate(client1.performRedo())
    propogate(client1.performRedo())
    assert.equal(client0.doc.getText(), 'boop banana hi world')
    assert.equal(client1.doc.getText(), 'boop banana hi world')

    propogate(client0.performUndo())
    assert.equal(client0.doc.getText(), 'boop banana hello world')
    assert.equal(client1.doc.getText(), 'boop banana hello world')

    propogate(client0.performUndo())
    assert.equal(client0.doc.getText(), 'boop banana hello')
    assert.equal(client1.doc.getText(), 'boop banana hello')

    propogate(client0.performUndo())
    assert.equal(client0.doc.getText(), 'boop banana ')
    assert.equal(client1.doc.getText(), 'boop banana ')
  })
})
