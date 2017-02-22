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
import type { Operation } from '../ot/types.js'

import { TextDocument } from '../ot/document.js'

import {
  castServerEdit
} from './types.js'

export interface IServerModel {
  doc: TextDocument,
  performEdit(newEdit: Edit): void,
  getEditRange(start?: number, stop?: number): ServerEdit,
  getEdit(editId: string): ServerEdit,
  getEditAt(index: number): ServerEdit,
  getNextIndex(): number,
  indexOfEdit(editId: string): ?number,
  hasEdit(editId: string): boolean,
}

export class InMemoryServerModel {
  doc: TextDocument

  editLog: Array<ServerEdit>
  editIds: Set<string>

  constructor() {
    (this: IServerModel)

    this.doc = new TextDocument()
    this.editLog = []
    this.editIds = new Set()
  }

  getText(): string {
    return this.doc.getText()
  }

  performEdit(edit: Edit): void {
    // apply
    if (edit.operation != null) {
      this.doc.apply(edit.operation)
    }

    edit.startIndex = this.getNextIndex()
    edit.nextIndex = edit.startIndex + 1
    edit.childHash = this.doc.getHash()

    // record
    this.editLog.push(castServerEdit(edit))
    if (edit.id == null) { throw new Error(`wat, id is null`) }
    this.editIds.add(edit.id)
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
      if (range.start !== this.editLog.length - 1) {
        throw new Error('no edits found for range')
      }
      return {
        operation: undefined,
        parentHash: this.doc.getHash(), // INCORRECT, fixme!
        childHash: this.doc.getHash(),
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

export class ServerModels {
  factory: (docId: string) => IServerModel
  documents: {[docId: string]: IServerModel}

  constructor(factory: (() => IServerModel)) {
    this.documents = {}
    this.factory = factory
  }
  getModel(docId: string) {
    if (!(docId in this.documents)) {
      this.documents[docId] = this.factory(docId)
    }

    return this.documents[docId]
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

  models: ServerModels

  constructor() {
    this.models = new ServerModels(() => new InMemoryServerModel())
  }

  state(docId: string): string {
    let model = this.models.getModel(docId)
    return model.doc.getText()
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
    let docId: string = clientUpdate.docId
    let sourceUid: string = clientUpdate.sourceUid

    let model: IServerModel = this.models.getModel(docId)

    let editId = clientEdit.id

    // this was already applied!
    if (model.hasEdit(editId)) {
      console.log(editId)

      const serverEdit = model.getEdit(editId)
      if (serverEdit == null) {
        throw new Error(`wat, server edit should exist: ${editId}`)
      }
      return {
        kind: 'ServerUpdateEvent',
        sourceUid: sourceUid,
        docId: docId,
        edit: serverEdit,
        opts: { ignoreIfNotAtSource: true } // only send this back to the source
      }
    }

    // transform the new update
    let historyEdit: Edit = model.getEditRange(clientEdit.startIndex)

    let [a, b] = [clientEdit, historyEdit]
    let [aP, bP] = OTHelper.transform(a, b)

    // apply the update
    model.performEdit(aP)

    return {
      kind: 'ServerUpdateEvent',
      sourceUid: sourceUid,
      docId: docId,
      edit: castServerEdit(aP),
      opts: {}
    }
  }

  handleConnection(clientResetRequest: ClientRequestSetupEvent)
  : [ServerFinishSetupEvent, ?ServerUpdateEvent] {
    const updateEdit: ?UpdateEdit = clientResetRequest.edit
    let docId: string = clientResetRequest.docId
    let sourceUid: string = clientResetRequest.sourceUid

    let model: IServerModel = this.models.getModel(docId)

    // the first unknown index on the client
    let startIndex: number = clientResetRequest.nextIndex

    // handle the update if it's still outstanding
    if (updateEdit != null) {
      let serverUpdate = this.handleUpdate({
        kind: 'ClientUpdateEvent',
        sourceUid: sourceUid,
        docId: docId,
        edit: updateEdit
      })

      // DON'T send this back to the source!
      // They'll receive this via the ServerFinishSetupEvent
      serverUpdate.opts.ignoreAtSource = true

      // find the index within the history of the outstanding edit
      const outstandingIndex = model.indexOfEdit(updateEdit.id)
      if (outstandingIndex == null) {
        throw new Error(
          `wat, how is this edit not in the history?
           edit: ${JSON.stringify(updateEdit)}
           clientRequest: ${JSON.stringify(clientResetRequest)}
           history: ${JSON.stringify(model)}`)
      }

      // coalesce the historical edits to get the client back up to speed
      let beforeEdit = model.getEditRange(startIndex, outstandingIndex)
      let ackEdit = model.getEditAt(outstandingIndex)
      let afterEdit = model.getEditRange(outstandingIndex + 1)

      let serverResponse: ServerFinishSetupEvent = {
        kind: 'ServerFinishSetupEvent',
        docId: docId,
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
        docId: docId,
        edits: [model.getEditRange(startIndex)]
      }
      return [
        serverResponse,
        undefined
      ]
    }
  }
}
