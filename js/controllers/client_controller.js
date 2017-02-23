/* @flow */

import EventEmitter from 'events'

import type {
  ServerFinishSetupEvent,
  ServerUpdateEvent,
  UndoAction,
  RedoAction,
  EditAction
} from './types.js'
import * as OTHelper from './ot_helper.js'
import type { IApplier } from './ot_helper.js'
import { OTClientHelper } from './ot_client_helper.js'

class ClientController<S> extends EventEmitter {

  clientHelper: OTClientHelper<S>

  constructor (applier: IApplier<S>) {
    super()
    this.clientHelper = new OTClientHelper(applier)

    this.on('server-event', (event) => this.handleServerEvent(event))
    this.on('view-action', (event) => this.handleViewAction(event))
  }

  handleServerEvent (event: ServerFinishSetupEvent | ServerUpdateEvent) {
    if (event.kind === 'ServerFinishSetupEvent') {
      let responses = this.clientHelper.handleConnection(event)
      for (let response of responses) {
        this.emit('client-event', response)
      }

    } else if (event.kind === 'ServerUpdateEvent') {
      let response = this.clientHelper.handleUpdate(event)
      if (response != null) {
        this.emit('client-event', response)
      }

    } else {
      throw new Error(`unknown server event: ${event}`)
    }
  }

  handleViewAction (event: UndoAction | RedoAction | EditAction) {
    if (event.kind === 'UndoAction') {
      let response = this.clientHelper.performUndo()
      if (response != null) {
        this.emit('client-event', response)
      }

    } else if (event.kind === 'RedoAction') {
      let response = this.clientHelper.performRedo()
      if (response != null) {
        this.emit('client-event', response)
      }

    } else if (event.kind === 'EditAction') {
      let response = this.clientHelper.performEdit(event.operation)
      if (response != null) {
        this.emit('client-event', response)
      }

    } else {
      throw new Error(`unknown view action: ${event}`)
    }
  }
}
