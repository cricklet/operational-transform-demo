/* @flow */

import SocketServer from 'socket.io'

import { ServerController } from '../controllers/server_controller.js'
import { castClientUpdatePacket } from '../controllers/types.js'
import type { ClientUpdatePacket, ServerUpdatePacket } from '../controllers/types.js'

export function setupServerConnection(
  port: number,
  serverController: ServerController,
  logger: (s: string) => void
): void {
  let server = new SocketServer()

  server.on('connection', (socket) => {

    // client opened a document
    socket.on('join-document', (docId) => {
      logger(`client joined document: ${docId}`)
      socket.join(docId)
    })

    // client sent an edit
    socket.on('client-update', (json) => {
      // parse the client update
      logger(`client sent update: ${json}`)
      let clientUpdate: ?ClientUpdatePacket = castClientUpdatePacket(JSON.parse(json))

      if (clientUpdate == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      // apply client update & compute response
      let serverUpdate = serverController.handleUpdate(clientUpdate)
      if (serverUpdate == null) { return }
      let serverUpdateJSON = JSON.stringify(serverUpdate)

      logger(`sending update: ${serverUpdateJSON}`)
      server.sockets.in(clientUpdate.docId).emit('server-update', serverUpdateJSON)
    })

  })

  server.listen(port)
}
