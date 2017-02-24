
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

    // send server messages to the clients
    function send (serverMessages: ServerEditMessage[]) {
      for (let serverMessage of serverMessages) {
        let serverMessageJSON = JSON.stringify(serverMessage)

        if (server.isLatestMessage(serverMessage)) { // this is not necessary -- it's an optimization
          // broadcast to all clients
          logger(`replying with edit: ${serverMessageJSON}`)
          socketServer.sockets.emit('server-edit-message', serverMessageJSON)

        } else {
          // just reply
          logger(`replying with edit: ${serverMessageJSON}`)
          socket.emit('server-edit-message', serverMessageJSON)
        }
      }
    }

    // on a client edit
    socket.on('client-edit-message', (json) => {
      // parse the client edit
      logger(`client edit: ${json}`)
      let editMessage: ?ClientEditMessage = castClientEditMessage(JSON.parse(json))

      if (editMessage == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // Handle the new edit
      send(server.handle(editMessage))
    })

    // when a client connects
    socket.on('client-request-history', (json) => {
      logger(`client history request: ${json}`)
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
