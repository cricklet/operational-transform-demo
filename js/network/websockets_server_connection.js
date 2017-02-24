
/* @flow */

import SocketServer from 'socket.io'

import { OTServerHelper } from '../controllers/ot_server_helper.js'
import { castClientEditMessage, castClientRequestHistory } from '../controllers/message_types.js'
import type { ClientEditMessage, ClientRequestHistory, ServerEditMessage } from '../controllers/message_types.js'

export function setupServerConnection(
  port: number,
  server: OTServerHelper,
  logger: (s: string) => void
): void {
  let socketServer = new SocketServer()

  socketServer.on('connection', (socket) => {
    function send (serverMessages: ServerEditMessage[]) {
      for (let serverMessage of serverMessages) {
        let serverMessageJSON = JSON.stringify(serverMessage)

        if (server.isLatestMessage(serverMessage)) {
          // broadcast to all clients
          logger(`replying with update: ${serverMessageJSON}`)
          socketServer.sockets.emit('server-message', serverMessageJSON)

        } else {
          // just reply
          logger(`replying with update: ${serverMessageJSON}`)
          socket.emit('server-message', serverMessageJSON)
        }
      }
    }

    // Client sent an edit
    socket.on('client-message', (json) => {
      // parse the client edit
      logger(`client sent update: ${json}`)
      let editMessage: ?ClientEditMessage = castClientEditMessage(JSON.parse(json))

      if (editMessage == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // Handle the new edit
      send(server.handle(editMessage))
    })

    // Client connected!
    socket.on('client-connect', (json) => {
      logger(`client connected: ${json}`)
      let connectionRequest: ?ClientRequestHistory = castClientRequestHistory(JSON.parse(json))

      if (connectionRequest == null) {
        throw new Error('un-parseable client connection request: ' + json)
      }

      // Handle connection request
      send(server.handle(connectionRequest))
    })

  })

  socketServer.listen(port)
}
