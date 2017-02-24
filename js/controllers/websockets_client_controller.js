/* @flow */

import SocketClient from 'socket.io-client'

import * as U from '../helpers/utils.js'
import { OTClientModel, OutOfOrderError } from '../models/ot_client_model.js'
import { castServerEditMessage } from '../models/message_types.js'
import type { ServerEditMessage, ClientEditMessage, ClientRequestHistory } from '../models/message_types.js'

import { debounce } from 'lodash'

export type ClientController = {
  send: (clientMessage: ClientEditMessage) => void
}

export function setupClientController(
  url: string,
  client: OTClientModel<*>,
  logger: (s: string) => void
): ClientController {
  let socket = new SocketClient(url)

  let resendIfNoAck = debounce((id: string) => {
    // If one of our edits gets dropped on the way to the server, we want
    // to try and resend it.

    let clientEditRequest = client.getOutstandingRequest()
    if (clientEditRequest == null) { return }

    if (clientEditRequest.edit.id !== id) {
      // Our edit got acknowledged successfully!
      // We're now waiting for an ack on a different edit.
      return
    }

    sendToServer(clientEditRequest) // Resend our edit...
    resendIfNoAck(id) // and wait for another ack.
  }, 4000)

  let forceResync = debounce((nextIndex: number) => {
    for (let clientRequest of client.generateSetupRequests()) {
      sendToServer(clientRequest)
    }
  }, 1000)

  function sendToServer(data: ?(ClientEditMessage | ClientRequestHistory)) {
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
  for (let clientMessage of client.generateSetupRequests()) {
    sendToServer(clientMessage)
  }

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
        sendToServer(clientEdit)
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
    send: (clientMessage) => { sendToServer(clientMessage); resendIfNoAck(clientMessage.edit.id) }
  }
}
