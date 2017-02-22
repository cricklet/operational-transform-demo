/* @flow */

import EventEmitter from 'events'

import type {
  ClientRequestSetupEvent,
  ClientUpdateEvent
} from './types.js'
import * as OTHelper from './ot_helper.js'
import { OTServerHelper } from './ot_server_helper.js'

class ServerController<S> extends EventEmitter {

  serverHelper: OTServerHelper

  constructor (docId: string) {
    super()
    this.on('client-event', (event) => this.handleClientEvent(event))
    this.serverHelper = new OTServerHelper()
  }

  handleClientEvent (event: ClientRequestSetupEvent | ClientUpdateEvent) {
    if (event.kind === 'ServerFinishSetupEvent') {
      let responses = this.serverHelper.handleConnection(event)
      for (let response of responses) {
        this.emit('server-event', response)
      }

    } else if (event.kind === 'ServerUpdateEvent') {
      let response = this.serverHelper.handleUpdate(event)
      if (response != null) {
        this.emit('server-event', response)
      }

    } else {
      throw new Error(`unknown server event: ${JSON.stringify(event)}`)
    }
  }

}
