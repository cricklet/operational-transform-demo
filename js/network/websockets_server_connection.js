
/* @flow */

import SocketServer from 'socket.io'

import { OTServerHelper } from '../controllers/ot_server_helper.js'
import { castClientEditMessage, castClientRequestHistory } from '../controllers/message_types.js'
import type { ClientEditMessage, ClientRequestHistory, ServerEditMessage } from '../controllers/message_types.js'

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
      // parse the client edit
      logger(`client sent update: ${json}`)
      let editMessage: ?ClientEditMessage = castClientEditMessage(JSON.parse(json))

      if (editMessage == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // apply client update & compute response
      let serverResponses = server.handle(editMessage)
      for (let serverResponse of serverResponses) {
        sendMessage(serverResponse)
      }
    })

    // Client connected!
    socket.on('client-connect', (json) => {
      logger(`client connected: ${json}`)
      let connectionRequest: ?ClientRequestHistory = castClientRequestHistory(JSON.parse(json))

      if (connectionRequest == null) {
        throw new Error('un-parseable client connection request: ' + json)
      }

      // Join the room associated with this document
      socket.join(DOC_ID)

      // Handle connection request & stream updates
      let serverResponses = server.handle(connectionRequest)
      for (let serverResponse of serverResponses) {
        sendMessage(serverResponse)
      }
    })

  })

  socketServer.listen(port)
}
