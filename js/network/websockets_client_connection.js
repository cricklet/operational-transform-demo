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
  client.emit('open-document', docId)

  let update = (clientUpdate: ClientUpdatePacket) => {
    let clientUpdateJSON = JSON.stringify(clientUpdate)
    client.emit('client-update', clientUpdateJSON)
  }

  client.on('server-update', (json) => {
    let data = JSON.parse(json)
    let serverUpdate: ?ServerUpdatePacket = castServerUpdatePacket(data)

    if (serverUpdate == null) {
      throw new Error('un-parseable server update: ' + json)
    }

    let clientUpdate: ?ClientUpdatePacket = clientController.handleUpdate(serverUpdate)
    if (clientUpdate != null) {
      update(clientUpdate)
    }
  })

  return {
    update: update
  }
}
