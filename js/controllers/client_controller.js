/* @flow */

import * as U from '../helpers/utils.js'

import type {
  BufferEdit,
  OutstandingEdit,
  EditsStack,
  ClientUpdatePacket,
  ClientResetRequest,
  ServerUpdatePacket,
  ServerResetResponse,
  ServerEdit
} from './types.js'

import { castOutstandingEdit } from './types.js'
import { OTHelper } from './ot_helper.js'
import type { Operation } from '../ot/types.js'

export class ClientController<S> {
  // This class maintains the state of the client, computes what updates
  // should be sent to the server (i.e. ClientUpdatePacket), and applies
  // remote updates (i.e. ServerUpdatePacket) to the local state.

  // ClientController {
  //   performEdit(edit: Operation): ?ClientUpdatePacket
  //   handleUpdate(serverUpdate: ServerUpdatePacket): ?ServerUpdatePacket
  // }

  // USAGE:

  // let client = new ClientController(...)
  //
  // connection.on('update', (serverUpdate) => { // LISTEN for remote changes
  //   let clientUpdate = client.handleUpdate(serverUpdate)
  //   connection.send(clientUpdate)
  // })
  //
  // let clientUpdate = client.performEdit(['hello']) // SEND local changes
  // connection.send(clientUpdate)

  uid: string

  docId: string

  state: S

  bufferEdit: BufferEdit
  // the client ops not yet sent to the server.

  outstandingEdit: OutstandingEdit
  // the client op that has been sent to the server (but not yet ACKd by the server)

  undos: EditsStack
  redos: EditsStack

  helper: OTHelper<S>

  constructor(docId: string, helper: OTHelper<S>) {
    this.helper = helper

    this.uid = U.genUid()
    this.docId = docId
    this.state = this.helper.initial()

    let hash = this.helper.hash(this.state)

    this.bufferEdit = {
      operation: undefined,
      childHash: hash
    }
    this.outstandingEdit = {
      startIndex: 0,
      parentHash: hash,
      operation: undefined,
      id: U.genUid()
    }
    this.undos = {
      operationsStack: [],
      parentHash: hash
    }
    this.redos = {
      operationsStack: [],
      parentHash: hash
    }
  }

  _checkInvariants () {
    let hash = this.helper.hash(this.state)

    if (this.bufferEdit.childHash !== hash) {
      throw new Error('buffer should point to current state')
    }

    if (this.undos.parentHash !== this.redos.parentHash) {
      throw new Error("wat, undos and redos should start at the same place")
    }

    if (this.undos.parentHash !== this.bufferEdit.childHash) {
      throw new Error("wat, undo should start on buffer end state.")
    }
  }

  _nextIndex(): number {
    // because neither the outstanding nor buffer exist on the
    // server yet, they don't increment the index at all!

    // thus, the next index we expect from the server is
    // exactly the index we think the outstanding exists at.
    return this.outstandingEdit.startIndex
  }

  _flushBuffer(): ?ClientUpdatePacket {
    // if there's no buffer, skip
    if (this.bufferEdit.operation == null) {
      return undefined
    }

    // if there is a outstanding, skip
    if (this.outstandingEdit.operation != null) {
      return undefined
    }

    // outstanding is now the buffer
    this.outstandingEdit = {
      operation: this.bufferEdit.operation,
      id: U.genUid(),
      parentHash: this.outstandingEdit.parentHash,
      startIndex: this.outstandingEdit.startIndex
    }

    // buffer is now empty
    this.bufferEdit = {
      operation: undefined,
      childHash: this.bufferEdit.childHash,
    }

    this._checkInvariants()

    return {
      kind: 'ClientUpdatePacket',
      edit: castOutstandingEdit(this.outstandingEdit),
      sourceUid: this.uid,
      docId: this.docId,
    }
  }

  handleUpdate(serverUpdate: ServerUpdatePacket)
  : ?(ClientUpdatePacket | ClientResetRequest) {
    let op: ServerEdit = serverUpdate.edit
    let docId: string = serverUpdate.docId

    if (docId !== this.docId) {
      throw new Error('wat, different doc id', docId, this.docId)
    }

    if (op.startIndex > this._nextIndex()) { // raise on future edits
      return {
        kind: 'ClientResetRequest',
        outstandingEdit: this.outstandingEdit,
        sourceUid: this.uid,
        docId: this.docId,
      }
    } else if (op.startIndex < this._nextIndex()) { // ignore old edits
      return undefined
    }

    return this.handleOrderedUpdate(serverUpdate)
  }

  handleOrderedUpdate(serverUpdate: ServerUpdatePacket)
  : ?ClientUpdatePacket {
    let op: ServerEdit = serverUpdate.edit
    let docId: string = serverUpdate.docId

    if (docId !== this.docId) {
      throw new Error('wat, different doc id', docId, this.docId)
    }

    if (op.startIndex !== this._nextIndex()) {
      throw new Error(`Expected server update #${this._nextIndex()} instead of ${op.startIndex}.`)
    }

    if (this.outstandingEdit != null && op.id === this.outstandingEdit.id) {
      if (serverUpdate.sourceUid !== this.uid) {
        throw new Error('wat, different source')
      }

      // clear the outstanding out
      this.outstandingEdit = {
        operation: undefined,
        id: U.genUid(),
        parentHash: op.childHash,
        startIndex: op.nextIndex
      }

      // undo & redo are already after the buffer
      return this._flushBuffer()

    } else {
      // transform the outstanding & buffer & op
      let [newOutstandingEdit, newBufferEdit, appliedEdit, newState]
          = this.helper.transformAndApplyBuffers(this.outstandingEdit, this.bufferEdit, op, this.state)

      // update undo
      this.undos = this.helper.transformEditsStack(appliedEdit, this.undos)
      this.redos = this.helper.transformEditsStack(appliedEdit, this.redos)

      // apply the operation
      this.state = newState

      // update outstanding & buffer
      this.outstandingEdit = newOutstandingEdit
      this.bufferEdit = newBufferEdit

      return undefined
    }
  }

  performUndo(): ?ClientUpdatePacket {
    let currentHash = this.helper.hash(this.state)
    let undoHash = this.undos.parentHash

    if (undoHash !== currentHash) {
      throw new Error('undo must refer to current state')
    }

    while (this.undos.operationsStack.length > 0) {
      // get the most recent undo
      let undo = this.undos.operationsStack.pop()

      if (undo == null) { // this undo is empty
        continue
      }

      // apply the operation
      let [newState, redo] = this.helper.apply(this.state, undo)
      let newHash = this.helper.hash(newState)

      this.state = newState

      // append applied undo to buffer
      this.bufferEdit = this.helper.compose([
        this.bufferEdit,
        { operation: undo, childHash: newHash }
      ])

      // update undos
      this.undos.parentHash = newHash

      // update redos
      this.redos.operationsStack.push(redo)
      this.redos.parentHash = newHash

      return this._flushBuffer()
    }
  }

  performRedo(): ?ClientUpdatePacket {
    let currentHash = this.helper.hash(this.state)
    let redoHash = this.redos.parentHash

    if (redoHash !== currentHash) {
      throw new Error('redo must refer to current state')
    }

    while (this.redos.operationsStack.length > 0) {
      // get the most recent redo
      let redo = this.redos.operationsStack.pop()

      if (redo == null) { // this redo is empty
        continue
      }

      // apply the operation
      let [newState, undo] = this.helper.apply(this.state, redo)
      let newHash = this.helper.hash(newState)

      this.state = newState

      // append applied redo to buffer
      this.bufferEdit = this.helper.compose([
        this.bufferEdit,
        { operation: redo, childHash: newHash }
      ])

      // update undos
      this.undos.operationsStack.push(undo)
      this.undos.parentHash = newHash

      // update redos
      this.redos.parentHash = newHash

      return this._flushBuffer()
    }
  }

  performNullableEdit(edit: ?Operation): ?ClientUpdatePacket {
    if (edit == null) {
      return undefined
    }

    return this.performEdit(edit)
  }

  performEdit(edit: Operation): ?ClientUpdatePacket {
    // apply the operation
    let [newState, undo] = this.helper.apply(this.state, edit)
    this.state = newState

    return this.handleAppliedEdit(edit, undo)
  }

  handleAppliedEdit(edit: Operation, undo: Operation)
  : ?ClientUpdatePacket { // return client op to broadcast
    let currentHash = this.helper.hash(this.state)

    // the op we just applied!
    let op: BufferEdit = {
      operation: edit,
      childHash: currentHash
    }

    // append operation to buffer (& thus bridge)
    this.bufferEdit = this.helper.compose([
      this.bufferEdit,
      op
    ])

    // append operation to undo stack
    this.undos.operationsStack.push(undo)
    this.undos.parentHash = currentHash

    // clear the redo stack
    this.redos.operationsStack = []
    this.redos.parentHash = currentHash

    return this._flushBuffer()
  }
}
