/* @flow */

import * as U from '../helpers/utils.js'

import type {
  Edit,
  PrebufferEdit,
  ClientUpdatePacket,
  ServerUpdatePacket,
  ServerEdit
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
  log: Array<ServerEdit>
}

export class OTDocuments {
  documents: {[docId: string]: OTDocument}
  helper: OTHelper<string>

  constructor(helper: OTHelper<string>) {
    this.helper = helper
    this.documents = {}
  }
  getDocument(docId: string) {
    if (!(docId in this.documents)) {
      this.documents[docId] = {
        docId: docId,
        state: this.helper.initial(),
        log: []
      }
    }

    return this.documents[docId]
  }
}

export class ServerController {
  // This class maintains the state of the server, computes what updates
  // should be sent to the client (i.e. ServerUpdatePacket), and applies
  // remote updates (i.e. ClientUpdatePacket) to the server state.

  // class ServerClient {
  //   handleUpdate(clientUpdate: ClientUpdatePacket): ?ServerUpdatePacket
  // }

  // USAGE: (w/ an imaginary 'connection' object)

  // let server = new ServerController(...)
  // let serverDocs = {...}
  //
  // connection.on('update', (clientUpdate) => { // LISTEN for remote changes
  //   let serverUpdate = server.handleUpdate(clientUpdate)
  //
  //   connection.broadcast(serverUpdate) // SEND applied changes
  // })

  helper: OTHelper<string>
  store: OTDocuments

  constructor(
    helper: OTHelper<string>,
    store?: OTDocuments
  ) {
    this.helper = helper

    if (store) {
      this.store = store
    } else {
      this.store = new OTDocuments(helper)
    }
  }

  _historyEdit(doc: OTDocument, startIndex: number): Edit {
    if (startIndex === doc.log.length) {
      return {
        operation: undefined,
        parentHash: this._hash(doc),
        childHash: this._hash(doc)
      }
    } else if (startIndex < doc.log.length) {
      let ops: Edit[] = U.array(U.subarray(doc.log, {start: startIndex}))
      if (ops.length === 0) { throw new Error('wat') }
      return this.helper.compose(ops)
    } else {
      throw new Error('wat ' + startIndex + ': ' + doc.log.join(', '))
    }
  }

  _hash(doc: OTDocument): string {
    return this.helper.hash(doc.state)
  }

  _nextIndex(doc: OTDocument): number {
    return doc.log.length
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

    let clientEdit: PrebufferEdit = clientUpdate.edit
    let docId: string = clientUpdate.docId
    let sourceUid: string = clientUpdate.sourceUid

    let doc: OTDocument = this.store.getDocument(docId)

    let historyEdit: Edit = this._historyEdit(doc, clientEdit.startIndex)

    let [a, b] = [clientEdit, historyEdit]
    let [aP, bP, undo, newState] = this.helper.transformAndApplyToServer(a, b, doc.state)

    aP.startIndex = this._nextIndex(doc)
    aP.nextIndex = aP.startIndex + 1

    doc.state = newState
    doc.log.push(aP)

    return {
      kind: 'ServerUpdatePacket',
      sourceUid: sourceUid,
      docId: docId,
      edit: castServerEdit(aP)
    }
  }
}
