/* @flow */

import SocketClient from 'socket.io-client'

import * as U from '../helpers/utils.js'
import { OTClientHelper } from '../controllers/ot_client_helper.js'
import { castServerEditMessage, castServerEditsMessage } from '../controllers/message_types.js'
import type { ServerEditMessage, ClientEditMessage, ClientConnectionRequest, ServerEditsMessage } from '../controllers/message_types.js'

export type ClientConnection = {
  update: (clientUpdate: ClientEditMessage) => void
}

export function setupClientConnection(
  url: string, docId: string,
  client: OTClientHelper<*>,
  logger: (s: string) => void
): ClientConnection {
  let socket = new SocketClient(url)

  let resendTimeout = undefined

  function resendIfNoAck() {
    let update = client.resendEdits()
    if (update == null) {
      console.log('done sending')
      clearTimeout(resendTimeout)
      return
    }

    console.log('trying to send again')
    clearTimeout(resendTimeout)
    resendTimeout = setTimeout(resendIfNoAck, 4000)
  }

  function sendUpdate (clientUpdate: ClientEditMessage) {
    let clientUpdateJSON = JSON.stringify(clientUpdate)
    socket.emit('client-update', clientUpdateJSON)

    clearTimeout(resendTimeout)
    resendTimeout = setTimeout(resendIfNoAck, 4000)
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
  socket.on('server-update', (json) => {
    logger(`server sent update: ${json}`)
    let serverUpdate: ?ServerEditMessage = castServerEditMessage(JSON.parse(json))
    if (serverUpdate == null) { throw new Error('un-parseable server update: ' + json) }

    // Apply server update & compute response
    let clientResponse: ?(ClientEditMessage | ClientConnectionRequest)
        = client.handleServerEdit(serverUpdate)

    if (clientResponse != null) {
      send(clientResponse)
    }
  })

  // Received a connection from the server
  socket.on('server-connect', (json) => {
    logger(`server sent connection: ${json}`)
    let connectionResponse: ?ServerEditsMessage = castServerEditsMessage(JSON.parse(json))
    if (connectionResponse == null) { throw new Error('un-parseable server update: ' + json) }

    // Apply changes we missed while disconnected
    let clientResponses: (ClientEditMessage | ClientConnectionRequest)[]
        = client.handleClientConnection(connectionResponse)

    for (let clientResponse of clientResponses) {
      send(clientResponse)
    }
  })

  return {
    update: sendUpdate
  }
}
