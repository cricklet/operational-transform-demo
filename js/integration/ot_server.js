/* @flow */

import * as U from '../helpers/utils.js'

import type {
  Operation,
  PrebufferOperation,
  ClientUpdate,
  ServerUpdate,
  ServerOperation
} from './shared.js'

import {
  OTHelper,
  castServerOp
} from './shared.js'

export type OTDocument = {
  docId: string,
  state: string,
  log: Array<ServerOperation>
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

export class OTServer {
  // This class maintains the state of the server, computes what updates
  // should be sent to the client (i.e. ServerUpdate), and applies
  // remote updates (i.e. ClientUpdate) to the server state.

  // class ServerClient {
  //   handleUpdate(clientUpdate: ClientUpdate): ?ServerUpdate
  // }

  // USAGE: (w/ an imaginary 'connection' object)

  // let server = new OTServer(...)
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

  _historyOp(doc: OTDocument, startIndex: number): Operation {
    if (startIndex === doc.log.length) {
      return {
        ops: undefined,
        parentHash: this._hash(doc),
        childHash: this._hash(doc)
      }
    } else if (startIndex < doc.log.length) {
      let ops: Operation[] = U.array(U.subarray(doc.log, {start: startIndex}))
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

  handleUpdate(clientUpdate: ClientUpdate)
  : ServerUpdate {
    // update the server state & return the update to broadcast to the clients

    // a = clientUpdate
    // b = historyOp

    // aP = serverUpdate to broadcast to the clients

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientOp: PrebufferOperation = clientUpdate.operation
    let docId: string = clientUpdate.docId
    let sourceUid: string = clientUpdate.sourceUid

    let doc: OTDocument = this.store.getDocument(docId)

    let historyOp: Operation = this._historyOp(doc, clientOp.startIndex)

    let [a, b] = [clientOp, historyOp]
    let [aP, bP, undo, newState] = this.helper.transformAndApplyToServer(a, b, doc.state)

    aP.startIndex = this._nextIndex(doc)
    aP.nextIndex = aP.startIndex + 1

    doc.state = newState
    doc.log.push(aP)

    return {
      sourceUid: sourceUid,
      docId: docId,
      operation: castServerOp(aP)
    }
  }
}
