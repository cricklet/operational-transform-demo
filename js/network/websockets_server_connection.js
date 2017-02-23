
/* @flow */

import SocketServer from 'socket.io'

import { OTServerHelper } from '../controllers/ot_server_helper.js'
import { castClientEditMessage, castClientConnectionRequest } from '../controllers/message_types.js'
import type { ClientEditMessage, ClientConnectionRequest, ServerEditMessage } from '../controllers/message_types.js'

let DOC_ID = 'asdf'

export function setupServerConnection(
  port: number,
  server: OTServerHelper,
  logger: (s: string) => void
): void {
  let socketServer = new SocketServer()

  socketServer.on('connection', (socket) => {
    function sendMessage (serverMessage: ServerEditMessage) {
      let serverMessageJSON = JSON.stringify(serverMessage)
      logger(`sending update: ${serverMessageJSON}`)
      socketServer.sockets.in(DOC_ID).emit('server-message', serverMessageJSON)
    }

    // Client sent an edit
    socket.on('client-message', (json) => {
      // parse the client update
      logger(`client sent update: ${json}`)
      let clientMessage: ?ClientEditMessage = castClientEditMessage(JSON.parse(json))

      if (clientMessage == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // apply client update & compute response
      let serverMessages = server.handle(clientMessage)
      for (let serverMessage of serverMessages) {
        sendMessage(serverMessage)
      }
    })

    // Client connected!
    socket.on('client-connect', (json) => {
      logger(`client connected: ${json}`)
      let clientMessage: ?ClientConnectionRequest = castClientConnectionRequest(JSON.parse(json))

      if (clientMessage == null) {
        throw new Error('un-parseable client connection request: ' + json)
      }

      // Join the room associated with this document
      socket.join(DOC_ID)

      // Apply client update & compute response
      let serverMessages = server.handle(clientMessage)
      for (let serverMessage of serverMessages) {
        sendMessage(serverMessage)
      }
    })

  })

  socketServer.listen(port)
}
