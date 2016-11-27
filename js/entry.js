/* @flow */

import { Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray } from './ot/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'
import { observeArray, observeObject } from './ot/observe'
import type { Client, Server, ServerRequest, ClientRequest } from './ot/rewrite/sites'
import * as Sites from './ot/rewrite/sites'
import type { TextOperation } from './ot/rewrite/operations'
import * as Operations from './ot/rewrite/operations'

type Lock = { ignoreEvents: boolean }

function generateLock(): Lock {
  return { ignoreEvents: false }
}

function getValuesFromDOMTextbox($text): [string, number, number] {
  return [
    $text.val(),
    $text.prop("selectionStart"),
    $text.prop("selectionEnd")
  ]
}

function updateDOMTextbox($text, client: { text: string }): void {
  // cursorStart: number, cursorEnd: number
  $text.val(client.text)
  // $text.prop("selectionStart", client.cursorStart),
  // $text.prop("selectionEnd", client.cursorEnd)
}

function setupClient(
  client: Client,
  propogate: (clientRequest: ?ClientRequest) => void,
  $text: any,
  delay: number
) {
  let lock = generateLock()

  let update = () => {
    // update the dom
    lock.ignoreEvents = true
    updateDOMTextbox($text, client)
    lock.ignoreEvents = false
  }

  observeObject(client,
    (_, key) => {// added
    },
    (_, key) => {// deleted
    },
    (_, key) => {// changed
      update()
    },
  )

  $text.on('input selectionchange propertychange', () => {
    if (lock.ignoreEvents) { return }

    let [newText, newCursorStart, newCursorEnd] = getValuesFromDOMTextbox($text)

    let op = Operations.inferOperations(client.text, newText)
    if (op != null) {
      let request = Sites.clientLocalOperation(client, op)
      setTimeout(() => propogate(request), delay)
    }

    update()
  })
}


function generatePropogator(server: Server, clients: Array<Client>) {
  function propogateFromServer (serverRequest: ?ServerRequest) {
    if (serverRequest == null) { return }

    console.log('\n\nPROPOGATING SERVER REQUEST', serverRequest.operation.operationId, serverRequest.operation, '\n')

    let clientRequests = []
    for (let client of clients) {
      clientRequests = push(clientRequests, Sites.clientRemoteOperation(client, serverRequest))
    }

    for (let clientRequest of clientRequests) {
      propogateFromClient(clientRequest)
    }
  }
  function propogateFromClient (clientRequest: ?ClientRequest) {
    if (clientRequest == null) { return }
    console.log('\n\nPROPOGATING CLIENT REQUEST', clientRequest.operation.operationId, clientRequest.operation, '\n')
    propogateFromServer(Sites.serverRemoteOperation(server, clientRequest))
  }
  return (...params) => {
    let printClients = () => {
      for (let c of clients) {
        console.log("CLIENT", c.uid)
        console.log('prebuffer',c.prebuffer)
        console.log('buffer',c.buffer)
        console.log('text',c.text)
      }
    }
    let printServer = () => {
      console.log("SERVER")
      for (let l of server.log) {
        console.log(l)
      }
    }
    console.log('\n\nSTART\n')
    printClients()
    printServer()
    propogateFromClient(...params)
    console.log('\n\nEND\n')
    printClients()
    printServer()
  }
}

$(document).ready(() => {
  let $text0 = $('#text0')
  let requests0 = []
  let client0 = Sites.generateClient()

  let $text1 = $('#text1')
  let requests1 = []
  let client1 = Sites.generateClient()

  let $text2 = $('#text2')
  let requests2 = []
  let client2 = Sites.generateClient()

  let server = Sites.generateServer()

  let propogate = generatePropogator(server, [client0, client1, client2])

  setupClient(client0, propogate, $text0, 500)
  setupClient(client1, propogate, $text1, 1000)
  setupClient(client2, propogate, $text2, 2000)
})
