/* @flow */

import * as U from '../helpers/utils.js'

import type {
  Edit,
  OutstandingEdit,
  ClientUpdateEvent,
  ClientRequestSetupEvent,
  ServerUpdateEvent,
  ServerFinishSetupEvent,
  ServerEdit,
  UpdateEdit
} from './types.js'

import * as OTHelper from './ot_helper.js'
import { TextApplier } from '../ot/applier.js'
import type { IApplier } from './ot_helper.js'
import type { Operation } from '../ot/types.js'

import {
  castServerEdit
} from './types.js'

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
        operation: undefined,
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
  // should be sent to the client (i.e. ServerUpdateEvent), and applies
  // remote updates (i.e. ClientUpdateEvent) to the server state.

  // class OTServerHelper {
  //   handleUpdate(clientUpdate: ClientUpdateEvent): ?ServerUpdateEvent
  // }

  // USAGE: (w/ an imaginary 'connection' object)

  // let server = new OTServerHelper(...)
  // let serverDocs = {...}
  //
  // connection.on('update', (clientUpdate) => { // LISTEN for remote changes
  //   let serverUpdate = server.handleUpdate(clientUpdate)
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

  handleUpdate(clientUpdate: ClientUpdateEvent)
  : ServerUpdateEvent {
    // update the server state & return the update to broadcast to the clients

    // a = clientUpdate
    // b = historyEdit

    // aP = serverUpdate to broadcast to the clients

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientEdit: UpdateEdit = clientUpdate.edit
    let sourceUid: string = clientUpdate.sourceUid

    let editId = clientEdit.id

    // this was already applied!
    if (this.doc.hasEdit(editId)) {
      console.log(editId)

      const serverEdit = this.doc.getEdit(editId)
      if (serverEdit == null) {
        throw new Error(`wat, server edit should exist: ${editId}`)
      }
      return {
        kind: 'ServerUpdateEvent',
        sourceUid: sourceUid,
        edit: serverEdit,
        opts: { ignoreIfNotAtSource: true } // only send this back to the source
      }
    }

    // apply the new update now
    let historyEdit: Edit = this.doc.getEditRange(clientEdit.startIndex)

    let [a, b] = [clientEdit, historyEdit]
    let [aP, bP, undo, newState] = OTHelper.transformAndApplyToServer(TextApplier, a, b, this.doc.text)

    aP.startIndex = this.doc.getNextIndex()
    aP.nextIndex = aP.startIndex + 1

    this.doc.update(newState, castServerEdit(aP))

    return {
      kind: 'ServerUpdateEvent',
      sourceUid: sourceUid,
      edit: castServerEdit(aP),
      opts: {}
    }
  }

  handleConnection(clientResetRequest: ClientRequestSetupEvent)
  : [ServerFinishSetupEvent, ?ServerUpdateEvent] {
    const updateEdit: ?UpdateEdit = clientResetRequest.edit
    let sourceUid: string = clientResetRequest.sourceUid

    // the first unknown index on the client
    let startIndex: number = clientResetRequest.nextIndex

    // handle the update if it's still outstanding
    if (updateEdit != null) {
      let serverUpdate = this.handleUpdate({
        kind: 'ClientUpdateEvent',
        sourceUid: sourceUid,
        edit: updateEdit
      })

      // DON'T send this back to the source!
      // They'll receive this via the ServerFinishSetupEvent
      serverUpdate.opts.ignoreAtSource = true

      // find the index within the history of the outstanding edit
      const outstandingIndex = this.doc.indexOfEdit(updateEdit.id)
      if (outstandingIndex == null) {
        throw new Error(
          `wat, how is this edit not in the history?
           edit: ${JSON.stringify(updateEdit)}
           clientRequest: ${JSON.stringify(clientResetRequest)}
           history: ${JSON.stringify(this.doc)}`)
      }

      // coalesce the historical edits to get the client back up to speed
      let beforeEdit = this.doc.getEditRange(startIndex, outstandingIndex)
      let ackEdit = this.doc.getEditAt(outstandingIndex)
      let afterEdit = this.doc.getEditRange(outstandingIndex + 1)

      let serverResponse: ServerFinishSetupEvent = {
        kind: 'ServerFinishSetupEvent',
        edits: [
          beforeEdit,
          ackEdit,
          afterEdit
        ].filter(edit => edit.nextIndex != edit.startIndex)
      }

      return [ serverResponse, serverUpdate ]

    } else {
      let serverResponse: ServerFinishSetupEvent = {
        kind: 'ServerFinishSetupEvent',
        edits: [this.doc.getEditRange(startIndex)]
      }
      return [
        serverResponse,
        undefined
      ]
    }
  }
}
