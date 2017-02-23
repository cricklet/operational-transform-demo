/* @flow */

import * as U from '../helpers/utils.js'

import type {
  BufferEdit,
  OutstandingEdit,
  EditsStack,
  ServerEdit,
  UpdateEdit
} from './edit_types.js'

import type {
  ClientEditMessage,
  ClientConnectionRequest,
  ServerEditMessage
} from './message_types.js'

import { castOutstandingEdit, castBufferEdit, castUpdateEdit } from './edit_types.js'
import * as OTHelper from './ot_helper.js'
import type { IApplier } from './ot_helper.js'
import type { Operation } from '../ot/types.js'

export class OutOfOrderError {}

export class OTClientHelper<S> {
  // This class maintains the state of the client, computes what updates
  // should be sent to the server (i.e. ClientEditMessage), and applies
  // remote updates (i.e. ServerEditMessage) to the local state.

  // OTClientHelper {
  //   performEdit(edit: Operation): ?ClientEditMessage
  //   handleClientEdit(serverMessage: ServerEditMessage): ?ServerEditMessage
  // }

  // USAGE:

  // let client = new OTClientHelper(...)
  //
  // connection.on('update', (serverMessage) => { // LISTEN for remote changes
  //   let clientUpdate = client.handleClientEdit(serverMessage)
  //   connection.send(clientUpdate)
  // })
  //
  // let clientUpdate = client.performEdit(['hello']) // SEND local changes
  // connection.send(clientUpdate)

  uid: string

  state: S

  bufferEdit: BufferEdit
  // the client ops not yet sent to the server.

  outstandingEdit: OutstandingEdit
  // the client op that has been sent to the server (but not yet ACKd by the server)

  undos: EditsStack
  redos: EditsStack

  applier: IApplier<S>

  changeListeners: (() => void)[]

  constructor(applier: IApplier<S>) {
    this.applier = applier

    this.uid = U.genUid()
    this.state = this.applier.initial()

    let hash = this.applier.stateHash(this.state)

    this.bufferEdit = {
      operation: undefined,
      childHash: hash
    }
    this.outstandingEdit = {
      startIndex: 0,
      parentHash: hash,
      operation: undefined,
      id: this._generateEditId()
    }
    this.undos = {
      operationsStack: [],
      parentHash: hash
    }
    this.redos = {
      operationsStack: [],
      parentHash: hash
    }

    this.changeListeners = []
  }

  _editCounter: number

  _generateEditId() {
    if (this._editCounter == null) {
      this._editCounter = 0
    }
    this._editCounter += 1
    return `${this.uid}:${this._editCounter}`
  }

  _checkInvariants () {
    let hash = this.applier.stateHash(this.state)

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

  _sendOutstandingEdits(): ?ClientEditMessage {
    const updateEdit = castUpdateEdit(this.outstandingEdit)
    if (updateEdit == null) {
      return undefined
    }

    return {
      kind: 'ClientEditMessage',
      edit: updateEdit,
      sourceUid: this.uid,
    }
  }

  _flushBuffer(): ?ClientEditMessage {
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
      id: this._generateEditId(),
      parentHash: this.outstandingEdit.parentHash,
      startIndex: this.outstandingEdit.startIndex
    }

    // buffer is now empty
    this.bufferEdit = {
      operation: undefined,
      childHash: this.bufferEdit.childHash,
    }

    this._checkInvariants()

    // send the newly outstanding buffer!
    let update = this._sendOutstandingEdits()
    if (update == null) {
      throw new Error(`wat, there should be outstanding edits: ${JSON.stringify(this)}, ${JSON.stringify(update)}`)
    }

    return update
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

  startConnecting(): ClientConnectionRequest {
    let updateEdit: ?UpdateEdit = castUpdateEdit(this.outstandingEdit)

    let request: ClientConnectionRequest = {
      kind: 'ClientConnectionRequest',
      nextIndex: this._nextIndex(),
      sourceUid: this.uid,
      edit: updateEdit
    }

    return request
  }

  resetConnection(): ClientConnectionRequest {
    return this.startConnecting()
  }

  retry(): ?ClientEditMessage {
    return this._sendOutstandingEdits()
  }

  handle(serverMessage: ServerEditMessage)
  : ?ClientEditMessage {
    let op: ServerEdit = serverMessage.edit

    if (op.startIndex < this._nextIndex()) { // ignore old updates
      return undefined
    }

    if (op.startIndex > this._nextIndex()) { // raise on future updates
      throw new OutOfOrderError()
    }

    if (serverMessage.ack === true) {
      if (this.outstandingEdit == null) {
        throw new Error('wat, we\'re not waiting on an ack')
      }

      if (op.id !== this.outstandingEdit.id) {
        throw new Error('wat, this isn\'t the op we\'re waiting for')
      }

      // clear the outstanding out
      this.outstandingEdit = {
        operation: undefined,
        id: this._generateEditId(),
        parentHash: op.childHash,
        startIndex: op.nextIndex
      }

      // undo & redo are already after the buffer
      return this._flushBuffer()

    } else {
      // transform the outstanding & buffer & op
      let [newOutstandingEdit, newBufferEdit, appliedEdit, newState]
          = OTHelper.transformAndApplyBuffers(this.applier, this.outstandingEdit, this.bufferEdit, op, this.state)

      // update undo
      this.undos = OTHelper.transformEditsStack(appliedEdit, this.undos)
      this.redos = OTHelper.transformEditsStack(appliedEdit, this.redos)

      // apply the operation
      this.state = newState
      this._notifyChangeListeners()

      // update outstanding & buffer
      this.outstandingEdit = newOutstandingEdit
      this.bufferEdit = newBufferEdit

      return undefined
    }
  }

  performUndo(): ?ClientEditMessage {
    let currentHash = this.applier.stateHash(this.state)
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
      let [newState, redo] = this.applier.apply(this.state, undo)
      let newHash = this.applier.stateHash(newState)

      this.state = newState
      this._notifyChangeListeners()

      // append applied undo to buffer
      this.bufferEdit = castBufferEdit(OTHelper.compose([
        this.bufferEdit,
        { operation: undo, childHash: newHash }
      ]))

      // update undos
      this.undos.parentHash = newHash

      // update redos
      this.redos.operationsStack.push(redo)
      this.redos.parentHash = newHash

      return this._flushBuffer()
    }
  }

  performRedo(): ?ClientEditMessage {
    let currentHash = this.applier.stateHash(this.state)
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
      let [newState, undo] = this.applier.apply(this.state, redo)
      let newHash = this.applier.stateHash(newState)

      this.state = newState
      this._notifyChangeListeners()

      // append applied redo to buffer
      this.bufferEdit = castBufferEdit(OTHelper.compose([
        this.bufferEdit,
        { operation: redo, childHash: newHash }
      ]))

      // update undos
      this.undos.operationsStack.push(undo)
      this.undos.parentHash = newHash

      // update redos
      this.redos.parentHash = newHash

      return this._flushBuffer()
    }
  }

  performEdit(edit: Operation): ?ClientEditMessage {
    if (edit.length === 0) {
      return undefined
    }

    // apply the operation
    let [newState, undo] = this.applier.apply(this.state, edit)
    this.state = newState
    this._notifyChangeListeners()

    let newHash = this.applier.stateHash(this.state)

    // the op we just applied!
    let op: BufferEdit = {
      operation: edit,
      childHash: newHash
    }

    // append operation to buffer (& thus bridge)
    this.bufferEdit = castBufferEdit(OTHelper.compose([
      this.bufferEdit,
      op
    ]))

    // append operation to undo stack
    this.undos.operationsStack.push(undo)
    this.undos.parentHash = newHash

    // clear the redo stack
    this.redos.operationsStack = []
    this.redos.parentHash = newHash

    return this._flushBuffer()
  }
}
