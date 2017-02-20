/* @flow */

import SocketClient from 'socket.io-client'

import { ClientController } from '../controllers/client_controller.js'
import { castServerUpdatePacket } from '../controllers/types.js'
import type { ServerUpdatePacket, ClientUpdatePacket } from '../controllers/types.js'

export type ClientConnection = {
  update: (clientUpdate: ClientUpdatePacket) => void
}

export function setupClientConnection(
  url: string, docId: string,
  clientController: ClientController<*>,
  logger: (s: string) => void
): ClientConnection {
  let client = new SocketClient(url)

  function emitUpdate (clientUpdate: ClientUpdatePacket) {
    let clientUpdateJSON = JSON.stringify(clientUpdate)
    client.emit('client-update', clientUpdateJSON)
  }

  // join the document
  client.emit('join-document', docId)

  // server sent an edit
  client.on('server-update', (json) => {
    // parse the server update
    logger(`server sent update: ${json}`)
    let serverUpdate: ?ServerUpdatePacket = castServerUpdatePacket(JSON.parse(json))

    if (serverUpdate == null) {
      throw new Error('un-parseable server update: ' + json)
    }

    // apply server update & compute response
    let clientUpdate: ?ClientUpdatePacket = clientController.handleOrderedUpdate(serverUpdate)
    if (clientUpdate != null) {
      emitUpdate(clientUpdate)
    }
  })

  return {
    update: emitUpdate
  }
}
