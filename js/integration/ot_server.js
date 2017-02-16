/* @flowx */

import { skipNulls, map, reiterable, concat, flatten, maybePush, hash, clone, merge, last, genUid, zipPairs, first, pop, push, contains, reverse, findLastIndex, subarray, asyncWait } from '../ot/utils.js'

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

export type OTDocument<O,S> = {
  docId: string,
  state: S,
  log: Array<ServerOperation<O>>
}

export class OTDocuments<O,S> {
  documents: {[docId: string]: OTDocument<O,S>}
  helper: OTHelper<O,S>

  constructor(helper: OTHelper<O,S>) {
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

export class OTServer<O,S> {
  // This class maintains the state of the server, computes what updates
  // should be sent to the client (i.e. ServerUpdate), and applies
  // remote updates (i.e. ClientUpdate) to the server state.

  // class ServerClient {
  //   handleUpdate(clientUpdate: ClientUpdate<O>): ?ServerUpdate<O>
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

  helper: OTHelper<O,S>
  store: OTDocuments<O,S>

  constructor(
    helper: OTHelper<O,S>,
    store?: OTDocuments<O,S>
  ) {
    this.helper = helper

    if (store) {
      this.store = store
    } else {
      this.store = new OTDocuments(helper)
    }
  }

  _historyOp(doc: OTDocument<O,S>, startIndex: number): Operation<O> {
    if (startIndex === doc.log.length) {
      return {
        ops: undefined,
        parentHash: this._hash(doc),
        childHash: this._hash(doc)
      }
    } else if (startIndex < doc.log.length) {
      let ops: Operation<O>[] = Array.from(subarray(doc.log, {start: startIndex})())
      if (ops.length === 0) { throw new Error('wat') }
      return this.helper.compose(ops)
    } else {
      throw new Error('wat ' + startIndex + ': ' + doc.log.join(', '))
    }
  }

  _hash(doc: OTDocument<O,S>): string {
    return this.helper.hash(doc.state)
  }

  _nextIndex(doc: OTDocument<O,S>): number {
    return doc.log.length
  }

  state(docId: string): S {
    return this.store.getDocument(docId).state
  }

  handleUpdate(clientUpdate: ClientUpdate<O>, )
  : ServerUpdate<O> {
    // update the server state & return the update to broadcast to the clients

    // a = clientUpdate
    // b = historyOp

    // aP = serverUpdate to broadcast to the clients

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientOp: PrebufferOperation<O> = clientUpdate.operation
    let docId: string = clientUpdate.docId

    let doc: OTDocument<O,S> = this.store.getDocument(docId)

    let historyOp: Operation<O> = this._historyOp(doc, clientOp.startIndex)

    let [a, b] = [clientOp, historyOp]
    let [aP, bP, undo, newState] = this.helper.transformAndApplyToServer(a, b, doc.state)

    aP.startIndex = this._nextIndex(doc)
    aP.nextIndex = aP.startIndex + 1

    doc.state = newState
    doc.log.push(aP)

    let appliedOp = castServerOp(aP)
    return appliedOp
  }
}
