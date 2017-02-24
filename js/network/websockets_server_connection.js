
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

    // on a client edit
    socket.on('client-edit-message', (json) => {
      // parse the client edit
      logger(`client edit: ${json}`)
      let editMessage: ?ClientEditMessage = castClientEditMessage(JSON.parse(json))

      if (editMessage == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // Handle the new edit
      let serverResponses = server.handle(editMessage)
      for (let serverResponse of serverResponses) {
        socketServer.sockets.emit(
          'server-edit-message', JSON.stringify(serverResponse))
      }
    })

    // when a client connects
    socket.on('client-request-history', (json) => {
      logger(`client history request: ${json}`)
      let historyRequest: ?ClientRequestHistory = castClientRequestHistory(JSON.parse(json))

      if (historyRequest == null) {
        throw new Error('un-parseable client connection request: ' + json)
      }

      // Handle the new edit
      let serverResponses = server.handle(historyRequest)
      for (let serverResponse of serverResponses) {
        socket.emit(
          'server-edit-message', JSON.stringify(serverResponse))
      }
    })

  })

  socketServer.listen(port)
}
