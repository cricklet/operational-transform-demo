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
  ClientRequestHistory,
  ServerEditMessage
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
  getLastIndex(): number,
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

  getLastIndex(): number{
    return this.editLog.length - 1
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

export class OTServerModel {
  // This class maintains the state of the server, computes what updates
  // should be sent to the client (i.e. ServerEditMessage), and applies
  // remote updates (i.e. ClientEditMessage) to the server state.

  // class OTServerModel {
  //   handle(clientMessage): ServerEditMessage[]
  // }

  // USAGE: (w/ an imaginary 'connection' object)

  // let server = new OTServerModel(...)
  // let serverDocs = {...}
  //
  // connection.on('update', (clientMessage) => { // LISTEN for remote changes
  //   let serverMessages = server.handle(clientMessage)
  //
  //   for (let serverMessage of serverMessages)
  //     connection.broadcast(serverMessage) // SEND applied changes
  // })

  doc: IDocument

  changeListeners: (() => void)[]

  constructor(doc?: IDocument) {
    if (doc) {
      this.doc = doc
    } else {
      this.doc = new InMemoryDocument()
    }

    this.changeListeners = []
  }

  state(): string {
    return this.doc.text
  }

  addChangeListener(listener: () => void) {
    this.changeListeners.push(listener)
  }

  _notifyChangeListeners() {
    setTimeout(() => {
      for (let listener of this.changeListeners) {
        listener()
      }
    }, 0)
  }

  _handleClientEdit(clientMessage: ClientEditMessage)
  : ServerEditMessage {
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
      return {
        kind: 'ServerEditMessage',
        edit: serverEdit,
      }
    }

    // apply the new update now
    let historyEdit: Edit = this.doc.getEditRange(clientEdit.startIndex)

    let [a, b] = [clientEdit, historyEdit]
    let [aP, bP, undo, newState] = OTHelper.transformAndApplyToServer(TextApplier, a, b, this.doc.text)

    aP.startIndex = this.doc.getNextIndex()
    aP.nextIndex = aP.startIndex + 1

    let serverEdit = castServerEdit(aP)

    this.doc.update(newState, serverEdit)
    this._notifyChangeListeners()

    return {
      kind: 'ServerEditMessage',
      edit: serverEdit,
    }
  }

  _handleClientHistoryRequest(clientHistoryRequest: ClientRequestHistory)
  : ServerEditMessage[] {
    const sourceUid: string = clientHistoryRequest.sourceUid
    const dontComposeEditId: ?string = clientHistoryRequest.dontComposeEditId

    // get the history starting at this index
    let startIndex: number = clientHistoryRequest.nextIndex

    if (dontComposeEditId == null || !this.doc.hasEdit(dontComposeEditId)) {
      // we can just compose the history & return it!
      return [
        {
          kind: 'ServerEditMessage',
          edit: this.doc.getEditRange(startIndex)
        }
      ]
    } else {
      // we can't just compose the history & return it.

      const dontComposeIndex = this.doc.indexOfEdit(dontComposeEditId)
      if (dontComposeIndex == null) {
        throw new Error('wat, we just checked that the edit is in the history')
      }

      // get the edits before & after the client's outstanding edit
      let beforeEdit = this.doc.getEditRange(startIndex, dontComposeIndex)
      let ackEdit = this.doc.getEditAt(dontComposeIndex)
      let afterEdit = this.doc.getEditRange(dontComposeIndex + 1)

      let responses = []

      if (!OTHelper.isEmpty(beforeEdit)) {
        responses.push({
          kind: 'ServerEditMessage',
          edit: beforeEdit
        })
      }

      responses.push({
        kind: 'ServerEditMessage',
        edit: ackEdit
      })

      if (!OTHelper.isEmpty(afterEdit)) {
        responses.push({
          kind: 'ServerEditMessage',
          edit: afterEdit
        })
      }

      return responses
    }
  }

  handle (clientMessage: ClientEditMessage | ClientRequestHistory)
  : ServerEditMessage[] {
    if (clientMessage.kind === 'ClientEditMessage') {
      return [ this._handleClientEdit(clientMessage) ]
    }

    if (clientMessage.kind === 'ClientRequestHistory') {
      return this._handleClientHistoryRequest(clientMessage)
    }

    throw new Error('wat')
  }

}
