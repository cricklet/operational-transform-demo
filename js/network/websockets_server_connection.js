
/* @flow */

import SocketServer from 'socket.io'

import { OTServerHelper } from '../controllers/ot_server_helper.js'
import { castClientEditMessage, castClientConnectionRequest } from '../controllers/message_types.js'
import type { ClientEditMessage, ClientConnectionRequest, ServerEditMessage, ServerEditsMessage } from '../controllers/message_types.js'

let DOC_ID = 'asdf'

export function setupServerConnection(
  port: number,
  server: OTServerHelper,
  logger: (s: string) => void
): void {
  let socketServer = new SocketServer()

  socketServer.on('connection', (socket) => {
    function sendUpdate (serverUpdate: ServerEditMessage) {
      let serverUpdateJSON = JSON.stringify(serverUpdate)
      logger(`sending update: ${serverUpdateJSON}`)
      socketServer.sockets.in(DOC_ID).emit('server-update', serverUpdateJSON)
    }

    function setupConnection (connectionResponse: ServerEditsMessage) {
      let connectionResponseJSON = JSON.stringify(connectionResponse)
      logger(`sending connection response: ${connectionResponseJSON}`)
      socketServer.sockets.in(DOC_ID).emit('server-connect', connectionResponseJSON)
    }

    // Client sent an edit
    socket.on('client-update', (json) => {
      // parse the client update
      logger(`client sent update: ${json}`)
      let clientUpdate: ?ClientEditMessage = castClientEditMessage(JSON.parse(json))

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
      let connectionRequest: ?ClientConnectionRequest = castClientConnectionRequest(JSON.parse(json))
      if (connectionRequest == null) { throw new Error('un-parseable client connection request: ' + json) }

      // Join the room associated with this document
      socket.join(DOC_ID)

      // Apply client update & compute response
      let [connectionResponse: ServerEditsMessage, serverUpdate: ?ServerEditMessage]
          = server.handleConnectionResponse(connectionRequest)

      if (serverUpdate != null) {
        sendUpdate(serverUpdate)
      }

      setupConnection(connectionResponse)
    })

  })

  socketServer.listen(port)
}
