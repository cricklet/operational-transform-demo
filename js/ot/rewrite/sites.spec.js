/* @flow */

"use strict"

let chai = require('chai')
chai.config.includeStack = true

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'
import { map, zip, flatten } from 'wu'

import * as Operations from './operations.js'
import * as Sites from './sites.js'
import { shuffle, push } from '../utils.js'
import type { Client, Server, ClientRequest, ServerRequest } from './sites.js'
import type { TextOperation } from './operations.js'

let FAKE_STATE = 'xyz'

function generatePropogator(server: Server, clients: Array<Client>) {
  function propogateFromServer (serverRequest: ?ServerRequest) {
    if (serverRequest == null) { return }

    let clientRequests = []

    for (let client of clients) {
      clientRequests = push(clientRequests, Sites.clientRemoteOperation(client, serverRequest))
    }

    for (let clientRequest of clientRequests) {
      propogateFromClient(clientRequest)
    }
  }
  function propogateFromClient (request: ?ClientRequest) {
    if (request == null) { return }
    propogateFromServer(Sites.serverRemoteOperation(server, request))
  }
  return propogateFromClient
}

describe('onLocalChange()', () => {
  it ('client updates client', () => {
    let client = Sites.generateClient()
    Sites.clientLocalInsert(client, 0, 'hello!')

    assert.equal('hello!', client.text)
  })
  it ('client updates server & client', () => {
    let client = Sites.generateClient()
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, [client])

    propogate(Sites.clientLocalInsert(client, 0, 'hello!'))

    assert.equal('hello!', client.text)
    assert.equal('hello!', server.text)
  })
  it ('two clients are handled', () => {
    let client0 = Sites.generateClient()
    let client1 = Sites.generateClient()
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, [client0, client1])

    propogate(Sites.clientLocalInsert(client1, 0, 'world'))
    propogate(Sites.clientLocalInsert(client0, 0, 'hello'))

    assert.equal('helloworld', client0.text)
    assert.equal('helloworld', client1.text)
    assert.equal('helloworld', server.text)
  })
  it ('two clients out of order', () => {
    let client0 = Sites.generateClient()
    let client1 = Sites.generateClient()
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, [client0, client1])

    let c1 = Sites.clientLocalInsert(client1, 0, '01234')
    let c2a = Sites.clientLocalInsert(client0, 0, 'abc')
    let c2b = Sites.clientLocalDelete(client0, 0, 3)

    propogate(c2a)
    propogate(c2b)
    propogate(c1)

    assert.equal('01234', client0.text)
    assert.equal('01234', client1.text)
    assert.equal('01234', server.text)
  })
  it ('multiple clients with interleaved requests', () => {
    let client0 = Sites.generateClient()
    let client1 = Sites.generateClient()
    let client2 = Sites.generateClient()

    let clients = [client0, client1, client2]
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, clients)

    let request0 = Sites.clientLocalInsert(client0, 0, 'hello')
    let request1 = Sites.clientLocalDelete(client0, 2, 3) // he

    let request2 = Sites.clientLocalInsert(client1, 0, 'dog')
    let request3 = Sites.clientLocalDelete(client1, 0, 1)
    let request4 = Sites.clientLocalInsert(client1, 0, 'g')
    let request5 = Sites.clientLocalDelete(client1, 2, 1)

    let request6 = Sites.clientLocalInsert(client1, 2, 'd') // god
    let request7 = Sites.clientLocalInsert(client2, 0, 'le')
    let request8 = Sites.clientLocalInsert(client2, 2, ' sigh') // le sigh

    assert.equal('he', client0.text)
    assert.equal('god', client1.text)
    assert.equal('le sigh', client2.text)
    assert.equal('', server.text)

    propogate(request0)
    propogate(request2)
    propogate(request6)
    propogate(request1)
    propogate(request3)
    propogate(request7)
    propogate(request8)
    propogate(request4)
    propogate(request5)

    assert.equal('le sighgodhe', client0.text)
    assert.equal('le sighgodhe', client1.text)
    assert.equal('le sighgodhe', client2.text)
    assert.equal('le sighgodhe', server.text)
  })
})
