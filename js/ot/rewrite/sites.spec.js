/* @flow */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'

import { assert } from 'chai'
import { map, zip, flatten } from 'wu'

import * as Operations from './operations.js'
import * as Sites from './sites.js'
import { shuffle } from '../utils.js'
import type { Client, Server, Request } from './sites.js'
import type { TextOperation } from './operations.js'

let FAKE_STATE = 'xyz'

function generatePropogator(server: Server, clients: Array<Client>) {
  let propogateFromServer = (requests: Array<Request>) => {
    for (let request of requests) {
      for (let client of clients) {
        propogateFromClient(Sites.applyRequest(client, request))
      }
    }
  }
  let propogateFromClient = (requests: Array<Request>) => {
    for (let request of requests) {
      propogateFromServer(Sites.applyRequest(server, request))
    }
  }
  return propogateFromClient
}

describe('onLocalChange()', () => {
  it ('client updates server & client', () => {
    let client = Sites.generateClient()
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, [client])

    propogate([Sites.applyLocalInsert(client, 0, 'hello!')])

    assert.equal('hello!', client.text)
    assert.equal('hello!', server.text)
  })
  it ('two clients are handled', () => {
    let client0 = Sites.generateClient()
    let client1 = Sites.generateClient()
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, [client0, client1])

    propogate([Sites.applyLocalInsert(client1, 0, 'world')])
    propogate([Sites.applyLocalInsert(client0, 0, 'hello')])

    assert.equal('helloworld', client0.text)
    assert.equal('helloworld', client1.text)
    assert.equal('helloworld', server.text)
  })
  it ('out of order requests', () => {
    let client = Sites.generateClient()
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, [client])

    let request0 = Sites.applyLocalInsert(client, 0, 'world')
    let request1 = Sites.applyLocalInsert(client, 0, 'hello ')
    let request2 = Sites.applyLocalInsert(client, 0, 'is ')
    let request3 = Sites.applyLocalInsert(client, 0, 'this ')

    propogate([request1])
    propogate([request2])
    propogate([request0])
    propogate([request3])

    assert.equal('this is hello world', client.text)
    assert.equal('this is hello world', server.text)
  })
  it.only ('multiple clients', () => {
    type InsertEvent = [ Sites.applyLocalInsert, number, string ]
    type DeleteEvent = [ Sites.applyLocalDelete, number, number ]
    type LocalEvent = InsertEvent | DeleteEvent

    let clientEvents: Array<Array<LocalEvent>> = [
      [[Sites.applyLocalInsert, 0, 'hello'], // hello
       [Sites.applyLocalDelete, 2, 3]], // he
      [[Sites.applyLocalInsert, 0, 'dog'],
       [Sites.applyLocalDelete, 0, 1],
       [Sites.applyLocalInsert, 0, 'g'],
       [Sites.applyLocalDelete, 2, 1],
       [Sites.applyLocalInsert, 2, 'd']], // god
      [[Sites.applyLocalInsert, 0, 'le'],
       [Sites.applyLocalInsert, 2, ' sigh']] // le sigh
    ]
    let clients = Array.from(map(Sites.generateClient, clientEvents))
    let server = Sites.generateServer()

    let propogate = generatePropogator(server, clients)

    let requests: Array<Request> = []
    for (let [client, events] of zip(clients, clientEvents)) {
      for (let [apply, position, value] of events) {
        let request = apply(client, position, value)
        requests.push(request)
      }
    }

    // randomize it!
    for (let request: Request of shuffle(requests)()) {
      propogate([request])
    }

    // at this point, each client as inputed a number of operations
    console.log(Array.from(map(c => c.text, clients)))
  })
})
