/* @flow */

import SocketClient from 'socket.io-client'

import * as U from '../helpers/utils.js'
import { OTClientHelper, OutOfOrderError } from '../controllers/ot_client_helper.js'
import { castServerEditMessage } from '../controllers/message_types.js'
import type { ServerEditMessage, ClientEditMessage, ClientRequestHistory } from '../controllers/message_types.js'

import { debounce } from 'lodash'

export type ClientConnection = {
  send: (clientMessage: ClientEditMessage) => void
}

export function setupClientConnection(
  url: string, docId: string,
  client: OTClientHelper<*>,
  logger: (s: string) => void
): ClientConnection {
  let socket = new SocketClient(url)

  let resendIfNoAck = debounce((id: string) => {
    let clientMessage = client.getOutstandingEditMessage()
    if (clientMessage == null) { return }
    if (clientMessage.edit.id !== id) { return }

    send(clientMessage)
    resendIfNoAck(id)
  }, 4000)

  let forceResync = debounce(() => {
    send(client.requestHistory())
  })

  function send(data: ?(ClientEditMessage | ClientRequestHistory)) {
    if (data == null) {
      return
    }

    if (data.kind === 'ClientEditMessage') {
      socket.emit('client-message', JSON.stringify(data))

    } else if (data.kind === 'ClientRequestHistory') {
      socket.emit('client-connect', JSON.stringify(data))
    }
  }

  // Join the document
  send(client.requestHistory())

  // Receive an edit from the server
  socket.on('server-message', (json) => {
    logger(`server sent message: ${json}`)

    let serverMessage: ?ServerEditMessage = castServerEditMessage(JSON.parse(json))
    if (serverMessage == null) {
      throw new Error('un-parseable server message: ' + json)
    }

    try {
      // Apply server message & compute response
      let clientEdit: ?ClientEditMessage = client.handle(serverMessage)
      if (clientEdit != null) {
        send(clientEdit)
        resendIfNoAck(clientEdit.edit.id)
      }

    } catch (e) {
      if (e instanceof OutOfOrderError) {
        forceResync()
      } else {
        throw e
      }
    }
  })

  return {
    send: send
  }
}
