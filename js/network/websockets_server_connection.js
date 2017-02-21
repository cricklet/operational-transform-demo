
/* @flow */

import SocketServer from 'socket.io'

import { ServerController } from '../controllers/server_controller.js'
import { castClientUpdatePacket, castClientConnectionRequest } from '../controllers/types.js'
import type { ClientUpdatePacket, ClientConnectionRequest, ServerUpdatePacket, ServerConnectionResponse } from '../controllers/types.js'

export function setupServerConnection(
  port: number,
  serverController: ServerController,
  logger: (s: string) => void
): void {
  let server = new SocketServer()

  server.on('connection', (socket) => {
    function sendUpdate (serverUpdate: ServerUpdatePacket) {
      let docId = serverUpdate.docId

      let serverUpdateJSON = JSON.stringify(serverUpdate)
      logger(`sending update: ${serverUpdateJSON}`)
      server.sockets.in(docId).emit('server-update', serverUpdateJSON)
    }

    function setupConnection (connectionResponse: ServerConnectionResponse) {
      let docId = connectionResponse.docId

      let connectionResponseJSON = JSON.stringify(connectionResponse)
      logger(`sending connection response: ${connectionResponseJSON}`)
      server.sockets.in(docId).emit('server-connect', connectionResponseJSON)
    }

    // Client sent an edit
    socket.on('client-update', (json) => {
      // parse the client update
      logger(`client sent update: ${json}`)
      let clientUpdate: ?ClientUpdatePacket = castClientUpdatePacket(JSON.parse(json))

      if (clientUpdate == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // apply client update & compute response
      let serverUpdate = serverController.handleUpdate(clientUpdate)
      if (serverUpdate != null) {
        sendUpdate(serverUpdate)
      }
    })

    // Client connected!
    socket.on('client-connect', (json) => {
      logger(`client connected: ${json}`)
      let connectionRequest: ?ClientConnectionRequest = castClientConnectionRequest(JSON.parse(json))
      if (connectionRequest == null) { throw new Error('un-parseable client connection request: ' + json) }

      // Join the room associated with this document
      let docId = connectionRequest.docId
      socket.join(docId)

      // Apply client update & compute response
      let [connectionResponse: ServerConnectionResponse, serverUpdate: ?ServerUpdatePacket]
          = serverController.handleConnection(connectionRequest)

      if (serverUpdate != null) {
        sendUpdate(serverUpdate)
      }

      setupConnection(connectionResponse)
    })

  })

  server.listen(port)
}
