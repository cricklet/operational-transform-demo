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
    socket.on('open-document', (docId) => {
      logger(`client joined document: ${docId}`)
      socket.join(docId)
    })
    socket.on('client-update', (json) => {
      logger(`client sent update: ${json}`)
      let data = JSON.parse(json)
      let clientUpdate: ?ClientUpdatePacket = castClientUpdatePacket(data)

      if (clientUpdate == null) {
        throw new Error('un-parseable client update: ' + json)
      }

      let docId = clientUpdate.docId

      let serverUpdate = serverController.handleUpdate(clientUpdate)
      if (serverUpdate == null) { return }
      let serverUpdateJSON = JSON.stringify(serverUpdate)

      logger(`sending update: ${serverUpdateJSON}`)
      server.sockets.in(docId).emit('server-update', serverUpdateJSON)
    })
  })

  server.listen(port)
}
