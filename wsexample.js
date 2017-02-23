/* @flow */

import * as readline from 'readline'
import * as process from 'process'

import SocketServer from 'socket.io'
import SocketClient from 'socket.io-client'

import type { ClientEditMessage, ServerEditMessage } from './js/controllers/message_types.js'
import { OTClientHelper } from './js/controllers/ot_client_helper.js'
import { OTServerHelper } from './js/controllers/ot_server_helper.js'

import { TextApplier } from './js/ot/applier.js'
import * as Inferrer from './js/ot/inferrer.js'
import * as Transformer from './js/ot/transformer.js'
import * as O from './js/ot/components.js'

import { allEqual, asyncSleep, remove, insert, genUid, pop, filterInPlace, subarray, NotifyOnce } from './js/helpers/utils.js'
import { find } from 'wu'

let PORT = 9643
let URL = `http://localhost:${PORT}`

let docId = '1234'

let socketServer = SocketServer();
let server = new OTServerHelper()

function serverHandler(docId: string, clientUpdate: ClientEditMessage): ?ServerEditMessage {
  return server.handleUpdate(clientUpdate)
}

function serializeServerEditMessage(serverUpdate: ServerEditMessage): string {
  return JSON.stringify(serverUpdate)
}

function deserializeServerEditMessage(json: string): ServerEditMessage {
  return JSON.parse(json)
}

function serializeClientEditMessage(clientUpdate: ClientEditMessage): string {
  return JSON.stringify(clientUpdate)
}

function deserializeClientEditMessage(json: string): [string, ClientEditMessage] {
  let packet = JSON.parse(json)
  return [ packet.docId, packet ]
}

socketServer.on('connection', (socket) => {
  socket.on('open document', (docId) => {
    // request room at index
    socket.join(docId)
  })
  socket.on('client update', (json) => {
    let [docId, clientUpdate] = deserializeClientEditMessage(json)
    let serverUpdate = serverHandler(docId, clientUpdate)
    if (serverUpdate == null) { return }
    let serverUpdateJSON = serializeServerEditMessage(serverUpdate)

    socketServer.sockets.in(docId).emit('server update', serverUpdateJSON)
  })
})

socketServer.listen(PORT)

function createClient(clientId, docId) {
  let client = SocketClient(URL)
  client.emit('open document', docId)

  let otClient = new OTClientHelper(TextApplier)

  client.on('server update', (json) => {
    let serverUpdate = deserializeServerEditMessage(json)

    let clientUpdate = otClient.handleOrderedUpdate(serverUpdate)
    printAll()

    if (clientUpdate != null) {
      let clientUpdateJSON = serializeClientEditMessage(clientUpdate)
      client.emit('client update', clientUpdateJSON)
    }
  })

  return {
    update: (newText: string) => {
      console.log(clientId, 'UPDATE', newText)

      let ops = Inferrer.inferOperation(otClient.state, newText)
      if (ops == null) { return }

      let clientUpdate = otClient.performEdit(ops)

      if (clientUpdate != null) {
        let clientUpdateJSON = serializeClientEditMessage(clientUpdate)
        client.emit('client update', clientUpdateJSON)
      }
    },
    current: () => {
      return otClient.state
    }
  }
}

let c0 = createClient('CLIENT0', 'DOC0')
let c1 = createClient('CLIENT1', 'DOC0')
let c2 = createClient('CLIENT2', 'DOC0')

let cs = [c0, c1, c2]

function printAll() {
  console.log('')
  for (let c of cs) {
    console.log(c.current())
  }
  console.log('')
}

let WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing",
  "elit", "nullam", "sit", "amet", "nulla", "non", "est", "finibus",
  "mollis", "nulla", "in", "felis", "eu", "felis", "vehicula", "viverra",
  "id", "lobortis", "massa", "aliquam", "mi", "dolor", "aliquet", "a",
  "volutpat", "vitae", "porta", "tempor", "eros", "vestibulum", "sit",
  "amet", "commodo", "ex", "vestibulum", "ante", "ipsum", "primis", "in",
  "faucibus", "orci", "luctus", "et", "ultrices", "posuere", "cubilia", "curae",
  "in", "dapibus", "sollicitudin", "est", "vel", "convallis", "class", "aptent",
  "taciti", "sociosqu", "ad", "litora", "torquent", "per", "conubia", "nostra",
  "per", "inceptos", "himenaeos"
]

function pickRandom<T>(arr: T[]): T {
  let i = Math.floor(Math.random() * arr.length)
  return arr[i]
}

function addWord(text) {
  let words = text.split(' ')
  let word = pickRandom(WORDS)
  let i = Math.floor(Math.random() * words.length)
  return insert(words, word, i).join(' ')
}

function deletePortion(text) {
  let words = text.split(' ')
  let i = Math.floor(Math.random() * words.length)
  return remove(words, i).join(' ')
}

function adjust(c) {
  if (Math.random() > 0.5) {
    c.update(addWord(c.current()))
  } else {
    c.update(deletePortion(c.current()))
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

let shouldAdjust = false

;(async () => {
  while (true) {
    await asyncSleep(500)

    if (shouldAdjust) {
      adjust(c0)
      adjust(c1)
      adjust(c2)
      adjust(c0)
      adjust(c1)
      adjust(c2)
    }
  }
})()

rl.on('line', (input) => {
  if (input === 'start') {
    shouldAdjust = true
  }

  if (input === 'stop') {
    shouldAdjust = false
  }
})
