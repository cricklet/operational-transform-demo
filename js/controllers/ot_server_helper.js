/* @flow */

import * as U from '../helpers/utils.js'

import type {
  Edit,
  OutstandingEdit,
  ClientUpdatePacket,
  ClientConnectionRequest,
  ServerUpdatePacket,
  ServerConnectionResponse,
  ServerEdit,
  UpdateEdit
} from './types.js'

import {
  OTHelper,
} from './ot_helper.js'

import {
  castServerEdit
} from './types.js'

export type OTDocument = {
  docId: string,
  state: string,
  editLog: Array<ServerEdit>,
  editIds: Set<string>,
}

export class OTDocumentStore {
  documents: {[docId: string]: OTDocument}

  constructor() {
    this.documents = {}
  }
  getDocument(docId: string) {
    if (!(docId in this.documents)) {
      this.documents[docId] = {
        docId: docId,
        state: '',
        editLog: [],
        editIds: new Set()
      }
    }

    return this.documents[docId]
  }
}

export class OTServerHelper {
  // This class maintains the state of the server, computes what updates
  // should be sent to the client (i.e. ServerUpdatePacket), and applies
  // remote updates (i.e. ClientUpdatePacket) to the server state.

  // class ServerClient {
  //   handleUpdate(clientUpdate: ClientUpdatePacket): ?ServerUpdatePacket
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

  helper: OTHelper<string>
  store: OTDocumentStore

  constructor(
    helper: OTHelper<string>,
    store?: OTDocumentStore
  ) {
    this.helper = helper

    if (store) {
      this.store = store
    } else {
      this.store = new OTDocumentStore()
    }
  }

  _historicalEdit(doc: OTDocument, start?: number, stop?: number): ServerEdit {
    let range = {
      start: start == null ? 0 : start,
      stop: stop == null ? doc.editLog.length : stop
    }

    if (range.start === range.stop) {
      return {
        operation: undefined,
        parentHash: this._hash(doc),
        childHash: this._hash(doc),
        startIndex: range.start,
        nextIndex: range.stop
      }
    }

    let edits: Edit[] = U.array(U.subarray(doc.editLog, range))
    if (edits.length === 0) {
      throw new Error(`no edits found for range: ${JSON.stringify(range)}`)
    }

    let composedEdit = this.helper.compose(edits)
    return castServerEdit(composedEdit)
  }

  _retrieveEdit(doc: OTDocument, editId: string): ?ServerEdit {
    let editIndex = this._indexOfEdit(doc, editId)
    if (editIndex == null) {
      return undefined
    } else {
      return doc.editLog[editIndex]
    }
  }

  _indexOfEdit(doc: OTDocument, editId: string): ?number {
    // find the index within the history of the outstanding edit
    return U.findIndex(edit => edit.id === editId, doc.editLog)
  }

  _hash(doc: OTDocument): string {
    return this.helper.hash(doc.state)
  }

  _nextIndex(doc: OTDocument): number {
    return doc.editLog.length
  }

  state(docId: string): string {
    return this.store.getDocument(docId).state
  }

  handleUpdate(clientUpdate: ClientUpdatePacket)
  : ServerUpdatePacket {
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

    let doc: OTDocument = this.store.getDocument(docId)

    let editId = clientEdit.id

    // this was already applied!
    if (doc.editIds.has(editId)) {
      console.log(editId)

      const serverEdit = this._retrieveEdit(doc, editId)
      if (serverEdit == null) {
        throw new Error(`wat, server edit should exist: ${editId}`)
      }
      return {
        kind: 'ServerUpdatePacket',
        sourceUid: sourceUid,
        docId: docId,
        edit: serverEdit,
        opts: { ignoreIfNotAtSource: true } // only send this back to the source
      }
    }

    // apply the new update now
    let historyEdit: Edit = this._historicalEdit(doc, clientEdit.startIndex)

    let [a, b] = [clientEdit, historyEdit]
    let [aP, bP, undo, newState] = this.helper.transformAndApplyToServer(a, b, doc.state)

    aP.startIndex = this._nextIndex(doc)
    aP.nextIndex = aP.startIndex + 1

    doc.state = newState
    doc.editLog.push(castServerEdit(aP))
    doc.editIds.add(aP.id)

    return {
      kind: 'ServerUpdatePacket',
      sourceUid: sourceUid,
      docId: docId,
      edit: castServerEdit(aP),
      opts: {}
    }
  }

  handleConnection(clientResetRequest: ClientConnectionRequest)
  : [ServerConnectionResponse, ?ServerUpdatePacket] {
    const updateEdit: ?UpdateEdit = clientResetRequest.edit
    let docId: string = clientResetRequest.docId
    let sourceUid: string = clientResetRequest.sourceUid

    let doc: OTDocument = this.store.getDocument(docId)

    // the first unknown index on the client
    let startIndex: number = clientResetRequest.nextIndex

    // handle the update if it's still outstanding
    if (updateEdit != null) {
      let serverUpdate = this.handleUpdate({
        kind: 'ClientUpdatePacket',
        sourceUid: sourceUid,
        docId: docId,
        edit: updateEdit
      })

      // DON'T send this back to the source!
      // They'll receive this via the ServerConnectionResponse
      serverUpdate.opts.ignoreAtSource = true

      // find the index within the history of the outstanding edit
      const outstandingIndex = this._indexOfEdit(doc, updateEdit.id)
      if (outstandingIndex == null) {
        throw new Error(
          `wat, how is this edit not in the history?
           edit: ${JSON.stringify(updateEdit)}
           clientRequest: ${JSON.stringify(clientResetRequest)}
           history: ${JSON.stringify(doc.editLog)}`)
      }

      // coalesce the historical edits to get the client back up to speed
      let beforeEdit = this._historicalEdit(doc, startIndex, outstandingIndex)
      let ackEdit = doc.editLog[outstandingIndex]
      let afterEdit = this._historicalEdit(doc, outstandingIndex + 1)

      let serverResponse: ServerConnectionResponse = {
        kind: 'ServerConnectionResponse',
        docId: docId,
        edits: [
          beforeEdit,
          ackEdit,
          afterEdit
        ].filter(edit => edit.nextIndex != edit.startIndex)
      }

      return [ serverResponse, serverUpdate ]

    } else {
      let serverResponse: ServerConnectionResponse = {
        kind: 'ServerConnectionResponse',
        docId: docId,
        edits: [this._historicalEdit(doc, startIndex)]
      }
      return [
        serverResponse,
        undefined
      ]
    }
  }
}
