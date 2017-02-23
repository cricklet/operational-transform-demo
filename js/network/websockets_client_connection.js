/* @flow */

import SocketClient from 'socket.io-client'

import * as U from '../helpers/utils.js'
import { OTClientHelper, OutOfOrderError } from '../controllers/ot_client_helper.js'
import { castServerEditMessage } from '../controllers/message_types.js'
import type { ServerEditMessage, ClientEditMessage, ClientConnectionRequest } from '../controllers/message_types.js'

export type ClientConnection = {
  send: (clientMessage: ClientEditMessage) => void
}

export function setupClientConnection(
  url: string, docId: string,
  client: OTClientHelper<*>,
  logger: (s: string) => void
): ClientConnection {
  let socket = new SocketClient(url)

  let retryTimeout = undefined
  function retry() {
    clearTimeout(retryTimeout)

    retryTimeout = setTimeout(() => {
      send(client.retry())
    }, 2000)
  }

  let reconnectTimeout = undefined
  function reconnect() {
    clearTimeout(reconnectTimeout)

    reconnectTimeout = setTimeout(() => {
      send(client.resetConnection())
    }, 2000)
  }

  function send(data: ?(ClientEditMessage | ClientConnectionRequest)) {
    if (data == null) {
      return
    }

    if (data.kind === 'ClientEditMessage') {
      socket.emit('client-message', JSON.stringify(data))

    } else if (data.kind === 'ClientConnectionRequest') {
      socket.emit('client-connect', JSON.stringify(data))
    }
  }

  // Join the document
  send(client.startConnecting())

  // Receive an edit from the server
  socket.on('server-message', (json) => {
    logger(`server sent message: ${json}`)

    let serverMessage: ?ServerEditMessage = castServerEditMessage(JSON.parse(json))
    if (serverMessage == null) {
      throw new Error('un-parseable server message: ' + json)
    }

    try {
      // Apply server message & compute response
      let clientResponse = client.handle(serverMessage)
      if (clientResponse != null) {
        send(clientResponse)
        retry()
      }

    } catch (e) {
      if (e instanceof OutOfOrderError) {
        reconnect()
      } else {
        throw e
      }
    }
  })

  return {
    send: send
  }
}
