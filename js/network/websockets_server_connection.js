
/* @flow */

import SocketServer from 'socket.io'

import { OTServerHelper } from '../controllers/ot_server_helper.js'
import { castClientUpdateEvent, castClientRequestSetupEvent } from '../controllers/types.js'
import type { ClientUpdateEvent, ClientRequestSetupEvent, ServerUpdateEvent, ServerFinishSetupEvent } from '../controllers/types.js'

export function setupServerConnection(
  port: number,
  server: OTServerHelper,
  logger: (s: string) => void
): void {
  let socketServer = new SocketServer()

  socketServer.on('connection', (socket) => {
    function sendUpdate (serverUpdate: ServerUpdateEvent) {
      let docId = serverUpdate.docId

      let serverUpdateJSON = JSON.stringify(serverUpdate)
      logger(`sending update: ${serverUpdateJSON}`)
      socketServer.sockets.in(docId).emit('server-update', serverUpdateJSON)
    }

    function setupConnection (connectionResponse: ServerFinishSetupEvent) {
      let docId = connectionResponse.docId

      let connectionResponseJSON = JSON.stringify(connectionResponse)
      logger(`sending connection response: ${connectionResponseJSON}`)
      socketServer.sockets.in(docId).emit('server-connect', connectionResponseJSON)
    }

    // Client sent an edit
    socket.on('client-update', (json) => {
      // parse the client update
      logger(`client sent update: ${json}`)
      let clientUpdate: ?ClientUpdateEvent = castClientUpdateEvent(JSON.parse(json))

      if (clientUpdate == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // apply client update & compute response
      let serverUpdate = server.handleUpdate(clientUpdate)
      if (serverUpdate != null) {
        sendUpdate(serverUpdate)
      }
    })

    // Client connected!
    socket.on('client-connect', (json) => {
      logger(`client connected: ${json}`)
      let connectionRequest: ?ClientRequestSetupEvent = castClientRequestSetupEvent(JSON.parse(json))
      if (connectionRequest == null) { throw new Error('un-parseable client connection request: ' + json) }

      // Join the room associated with this document
      let docId = connectionRequest.docId
      socket.join(docId)

      // Apply client update & compute response
      let [connectionResponse: ServerFinishSetupEvent, serverUpdate: ?ServerUpdateEvent]
          = server.handleConnection(connectionRequest)

      if (serverUpdate != null) {
        sendUpdate(serverUpdate)
      }

      setupConnection(connectionResponse)
    })

  })

  socketServer.listen(port)
}
