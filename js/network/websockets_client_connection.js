/* @flow */

import SocketClient from 'socket.io-client'

import * as U from '../helpers/utils.js'
import { OTClientHelper } from '../controllers/ot_client_helper.js'
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

  let resendTimeout = undefined

  function retryUpdate() {
    let message = client.retry()
    if (message == null) {
      console.log('done sending')
      clearTimeout(resendTimeout)
      return
    }

    console.log('trying to send again')
    clearTimeout(resendTimeout)
    resendTimeout = setTimeout(retryUpdate, 4000)
  }

  function sendUpdate (clientMessage: ClientEditMessage) {
    let clientMessageJSON = JSON.stringify(clientMessage)
    socket.emit('client-message', clientMessageJSON)

    clearTimeout(resendTimeout)
    resendTimeout = setTimeout(retryUpdate, 4000)
  }

  function requestConnection (connectionRequest: ClientConnectionRequest) {
    let connectionRequestJSON = JSON.stringify(connectionRequest)
    socket.emit('client-connect', connectionRequestJSON)
  }

  function send(data: ClientEditMessage | ClientConnectionRequest) {
    if (data.kind === 'ClientEditMessage') {
      sendUpdate(data)
    } else if (data.kind === 'ClientConnectionRequest') {
      requestConnection(data)
    }
  }

  // Join the document
  requestConnection(client.startConnecting())

  // Receive an edit from the server
  socket.on('server-message', (json) => {
    logger(`server sent message: ${json}`)
    let serverUpdate: ?ServerEditMessage = castServerEditMessage(JSON.parse(json))
    if (serverUpdate == null) { throw new Error('un-parseable server message: ' + json) }

    // Apply server message & compute response
    let clientResponse = client.handle(serverUpdate)

    if (clientResponse != null) {
      send(clientResponse)
    }
  })

  return {
    send: sendUpdate
  }
}
