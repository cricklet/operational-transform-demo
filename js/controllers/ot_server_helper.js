/* @flow */

import * as U from '../helpers/utils.js'

import type {
  Edit,
  OutstandingEdit,
  ServerEdit,
  UpdateEdit
} from './edit_types.js'

import type {
  ClientEditMessage,
  ClientConnectionRequest,
  ServerEditMessage
} from './message_types.js'

import {
  BROADCAST_TO_ALL,
  REPLY_TO_SOURCE,
  BROADCAST_OMITTING_SOURCE
} from './message_types.js'

import * as OTHelper from './ot_helper.js'
import { TextApplier } from '../ot/applier.js'
import type { IApplier } from './ot_helper.js'
import type { Operation } from '../ot/types.js'

import {
  castServerEdit
} from './edit_types.js'

export interface IDocument {
  text: string,
  update(newText: string, newEdit: ServerEdit): void,
  getEditRange(start?: number, stop?: number): ServerEdit,
  getEdit(editId: string): ServerEdit,
  getEditAt(index: number): ServerEdit,
  getNextIndex(): number,
  indexOfEdit(editId: string): ?number,
  hasEdit(editId: string): boolean,
}

export class InMemoryDocument {
  text: string
  editLog: Array<ServerEdit>
  editIds: Set<string>

  constructor() {
    (this: IDocument)

    this.text = ''
    this.editLog = []
    this.editIds = new Set()
  }

  update(newText: string, newEdit: ServerEdit): void {
    this.text = newText
    this.editLog.push(newEdit)
    if (newEdit.id == null) { throw new Error(`wat, id is null`) }
    this.editIds.add(newEdit.id)
  }

  hasEdit(editId: string): boolean {
    return this.editIds.has(editId)
  }

  getEditAt(index: number): ServerEdit {
    if (index > this.editLog.length) {
      throw new Error(`can't find edit at ${index} in log w/ ${this.editLog.length} edits`)
    }
    return this.editLog[index]
  }

  getNextIndex(): number{
    return this.editLog.length
  }

  getEditRange(start?: number, stop?: number): ServerEdit {
    let range = {
      start: start == null ? 0 : start,
      stop: stop == null ? this.editLog.length : stop
    }

    if (range.start === range.stop) {
      return {
        operation: [],
        parentHash: this.text,
        childHash: this.text,
        startIndex: range.start,
        nextIndex: range.stop
      }
    }

    let edits: Edit[] = U.array(U.subarray(this.editLog, range))
    if (edits.length === 0) {
      throw new Error(`no edits found for range: ${JSON.stringify(range)}`)
    }

    let composedEdit = OTHelper.compose(edits)
    return castServerEdit(composedEdit)
  }

  getEdit(editId: string): ServerEdit {
    let editIndex = this.indexOfEdit(editId)
    if (editIndex == null) {
      throw new Error(`edit not found ${editId}`)
    } else {
      return this.editLog[editIndex]
    }
  }

  indexOfEdit(editId: string): ?number {
    // find the index within the history of the outstanding edit
    return U.findIndex(edit => edit.id === editId, this.editLog)
  }
}

export class OTServerHelper {
  // This class maintains the state of the server, computes what updates
  // should be sent to the client (i.e. ServerEditMessage), and applies
  // remote updates (i.e. ClientEditMessage) to the server state.

  // class OTServerHelper {
  //   handleClientEdit(clientMessage: ClientEditMessage): ?ServerEditMessage
  // }

  // USAGE: (w/ an imaginary 'connection' object)

  // let server = new OTServerHelper(...)
  // let serverDocs = {...}
  //
  // connection.on('update', (clientMessage) => { // LISTEN for remote changes
  //   let serverUpdate = server.handleClientEdit(clientMessage)
  //
  //   connection.broadcast(serverUpdate) // SEND applied changes
  // })

  doc: IDocument

  constructor(doc?: IDocument) {
    if (doc) {
      this.doc = doc
    } else {
      this.doc = new InMemoryDocument()
    }
  }

  state(): string {
    return this.doc.text
  }

  handleClientEdit(clientMessage: ClientEditMessage)
  : ServerEditMessage[] {
    // update the server state & return the update to broadcast to the clients

    // a = clientMessage
    // b = historyEdit

    // aP = serverUpdate to broadcast to the clients

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientEdit: UpdateEdit = clientMessage.edit
    let sourceUid: string = clientMessage.sourceUid

    let editId = clientEdit.id

    // this was already applied!
    if (this.doc.hasEdit(editId)) {
      const serverEdit = this.doc.getEdit(editId)
      if (serverEdit == null) {
        throw new Error(`wat, server edit should exist: ${editId}`)
      }
      return [{
        kind: 'ServerEditMessage',
        edit: serverEdit,
        ack: true,
        mode: REPLY_TO_SOURCE
      }]
    }

    // apply the new update now
    let historyEdit: Edit = this.doc.getEditRange(clientEdit.startIndex)

    let [a, b] = [clientEdit, historyEdit]
    let [aP, bP, undo, newState] = OTHelper.transformAndApplyToServer(TextApplier, a, b, this.doc.text)

    aP.startIndex = this.doc.getNextIndex()
    aP.nextIndex = aP.startIndex + 1

    let serverEdit = castServerEdit(aP)

    this.doc.update(newState, serverEdit)

    return [
      {
        kind: 'ServerEditMessage',
        edit: serverEdit,
        ack: false,
        mode: BROADCAST_OMITTING_SOURCE
      },
      {
        kind: 'ServerEditMessage',
        edit: serverEdit,
        ack: true,
        mode: REPLY_TO_SOURCE
      }
    ]
  }

  handleServerEdits(clientResetRequest: ClientConnectionRequest)
  : ServerEditMessage[] {
    const updateEdit: ?UpdateEdit = clientResetRequest.edit
    let sourceUid: string = clientResetRequest.sourceUid

    // the first unknown index on the client
    let startIndex: number = clientResetRequest.nextIndex

    // the client has no outstanding update
    if (updateEdit == null) {
      return [ // just return the missing history
        {
          kind: 'ServerEditMessage',
          edit: this.doc.getEditRange(startIndex),
          ack: false,
          mode: REPLY_TO_SOURCE
        }
      ]
    }

    // the client's outstanding update has already been applied
    if (this.doc.hasEdit(updateEdit.id)) {

      // when was the client's update already applied?
      const updateIndex = this.doc.indexOfEdit(updateEdit.id)
      if (updateIndex == null) {
        throw new Error('wat, we just checked that the edit is in the history')
      }

      // get the edits before & after the client's update
      let beforeEdit = this.doc.getEditRange(startIndex, updateIndex)
      let ackEdit = this.doc.getEditAt(updateIndex)
      let afterEdit = this.doc.getEditRange(updateIndex + 1)

      let responses = []

      if (!OTHelper.isEmpty(beforeEdit)) {
        responses.push({
          kind: 'ServerEditMessage',
          edit: beforeEdit,
          ack: false,
          mode: 'REPLY_TO_SOURCE'
        })
      }

      if (OTHelper.isEmpty(ackEdit)) {
        throw new Error('wat, how is the ack edit empty?')
      }

      responses.push({
        kind: 'ServerEditMessage',
        edit: ackEdit,
        ack: true,
        mode: 'REPLY_TO_SOURCE'
      })

      if (!OTHelper.isEmpty(afterEdit)) {
        responses.push({
          kind: 'ServerEditMessage',
          edit: afterEdit,
          ack: false,
          mode: 'REPLY_TO_SOURCE'
        })
      }

      return responses
    }

    // we need to apply the client's update
    else {
      let responses = []

      // emit the historical edits before applying the client's update
      let beforeEdit = this.doc.getEditRange(startIndex)
      if (!OTHelper.isEmpty(beforeEdit)) {
        responses.push({
          kind: 'ServerEditMessage',
          edit: beforeEdit,
          ack: false,
          mode: 'REPLY_TO_SOURCE'
        })
      }

      // apply the client's update!
      let updateResponses = this.handleClientEdit({
        kind: 'ClientEditMessage',
        sourceUid: sourceUid,
        edit: updateEdit
      })

      for (let updateResponse of updateResponses) {
        responses.push(updateResponse)
      }

      return responses
    }
  }
}
