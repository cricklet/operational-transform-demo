/* @flow */

import SocketClient from 'socket.io-client'

import * as U from '../helpers/utils.js'
import { OTClientHelper } from '../controllers/ot_client_helper.js'
import { castServerUpdatePacket, castServerConnectionResponse } from '../controllers/types.js'
import type { ServerUpdatePacket, ClientUpdatePacket, ClientConnectionRequest, ServerConnectionResponse } from '../controllers/types.js'

export type ClientConnection = {
  update: (clientUpdate: ClientUpdatePacket) => void
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

  function sendUpdate (clientUpdate: ClientUpdatePacket) {
    let clientUpdateJSON = JSON.stringify(clientUpdate)
    socket.emit('client-update', clientUpdateJSON)

    clearTimeout(resendTimeout)
    resendTimeout = setTimeout(resendIfNoAck, 4000)
  }

  function requestConnection (connectionRequest: ClientConnectionRequest) {
    let connectionRequestJSON = JSON.stringify(connectionRequest)
    socket.emit('client-connect', connectionRequestJSON)
  }

  function send(data: ClientUpdatePacket | ClientConnectionRequest) {
    if (data.kind === 'ClientUpdatePacket') {
      sendUpdate(data)
    } else if (data.kind === 'ClientConnectionRequest') {
      requestConnection(data)
    }
  }

  // Join the document
  requestConnection(client.establishConnection())

  // Receive an edit from the server
  socket.on('server-update', (json) => {
    logger(`server sent update: ${json}`)
    let serverUpdate: ?ServerUpdatePacket = castServerUpdatePacket(JSON.parse(json))
    if (serverUpdate == null) { throw new Error('un-parseable server update: ' + json) }

    // Apply server update & compute response
    let clientResponse: ?(ClientUpdatePacket | ClientConnectionRequest)
        = client.handleUpdate(serverUpdate)

    if (clientResponse != null) {
      send(clientResponse)
    }
  })

  // Received a connection from the server
  socket.on('server-connect', (json) => {
    logger(`server sent connection: ${json}`)
    let connectionResponse: ?ServerConnectionResponse = castServerConnectionResponse(JSON.parse(json))
    if (connectionResponse == null) { throw new Error('un-parseable server update: ' + json) }

    // Apply changes we missed while disconnected
    let clientResponses: (ClientUpdatePacket | ClientConnectionRequest)[]
        = client.handleConnection(connectionResponse)

    for (let clientResponse of clientResponses) {
      send(clientResponse)
    }
  })

  return {
    update: sendUpdate
  }
}
