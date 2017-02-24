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
  url: string,
  client: OTClientHelper<*>,
  logger: (s: string) => void
): ClientConnection {
  let socket = new SocketClient(url)

  let resendIfNoAck = debounce((id: string) => {
    // If one of our edits gets dropped on the way to the server, we want
    // to try and resend it.

    let clientMessage = client.getOutstandingMessage()
    if (clientMessage == null) { return }

    if (clientMessage.edit.id !== id) {
      // Our edit got acknowledged successfully!
      // We're now waiting for an ack on a different edit.
      return
    }

    emit(clientMessage) // Resend our edit...
    resendIfNoAck(id) // and wait for another ack.
  }, 4000)

  let forceResync = debounce((nextIndex: number) => {
    // There could be edge cases where the client gets edits from the server
    // out of order. In these cases, the client asks the server for the latest,
    // definitive edit history.

    let historyRequest = client.generateHistoryRequest()
    if (historyRequest.nextIndex > nextIndex) {
      // Apparently we already succesfully applied the update @ nextIndex.
      // We're no longer out of sync with the server!
      return
    }
    emit(historyRequest)
  }, 1000)

  function emit(data: ?(ClientEditMessage | ClientRequestHistory)) {
    if (data == null) {
      return
    }

    if (data.kind === 'ClientEditMessage') {
      socket.emit('client-edit-message', JSON.stringify(data))

    } else if (data.kind === 'ClientRequestHistory') {
      socket.emit('client-request-history', JSON.stringify(data))
    }
  }

  // Join the document
  emit(client.generateHistoryRequest())

  // Receive an edit from the server
  socket.on('server-edit-message', (json) => {
    logger(`server sent message: ${json}`)

    let serverEdit: ?ServerEditMessage = castServerEditMessage(JSON.parse(json))
    if (serverEdit == null) {
      throw new Error('un-parseable server message: ' + json)
    }

    try {
      // Apply the server edit & compute response
      let clientEdit: ?ClientEditMessage = client.handle(serverEdit)
      if (clientEdit != null) {
        emit(clientEdit)
        resendIfNoAck(clientEdit.edit.id)
      }

    } catch (e) {
      if (e instanceof OutOfOrderError) {
        forceResync(client.getNextIndex())
      } else {
        throw e
      }
    }
  })

  return {
    send: (clientMessage) => { emit(clientMessage); resendIfNoAck(clientMessage.edit.id) }
  }
}
