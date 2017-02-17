/* @flow */

import * as U from '../helpers/utils.js'

import type {
  BufferEdit,
  PrebufferEdit,
  EditsStack,
  ClientUpdatePacket,
  ServerUpdatePacket,
  ServerEdit
} from './types.js'

import { castPrebufferEdit } from './types.js'
import { OTHelper } from './ot_helper.js'
import type { Operation } from '../ot/types.js'

export class OutOfOrderUpdate extends Error {
  expectedIndex: number
  actualIndex: number
  constructor(indices: { expected: number, actual: number }) {
    super(`Expected ${indices.expected}, received ${indices.actual}.`)
    this.expectedIndex = indices.expected
    this.actualIndex = indices.actual
  }
}

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

  buffer: BufferEdit
  // the client ops not yet sent to the server.

  prebuffer: PrebufferEdit
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

    this.buffer = {
      operation: undefined,
      childHash: hash
    }
    this.prebuffer = {
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

    if (this.buffer.childHash !== hash) {
      throw new Error('buffer should point to current state')
    }

    if (this.undos.parentHash !== this.redos.parentHash) {
      throw new Error("wat, undos and redos should start at the same place")
    }

    if (this.undos.parentHash !== this.buffer.childHash) {
      throw new Error("wat, undo should start on buffer end state.")
    }
  }

  _nextIndex(): number {
    // because neither the prebuffer nor buffer exist on the
    // server yet, they don't increment the index at all!

    // thus, the next index we expect from the server is
    // exactly the index we think the prebuffer exists at.
    return this.prebuffer.startIndex
  }

  _flushBuffer(): ?ClientUpdatePacket {
    // if there's no buffer, skip
    if (this.buffer.operation == null) {
      return undefined
    }

    // if there is a prebuffer, skip
    if (this.prebuffer.operation != null) {
      return undefined
    }

    // prebuffer is now the buffer
    this.prebuffer = {
      operation: this.buffer.operation,
      id: U.genUid(),
      parentHash: this.prebuffer.parentHash,
      startIndex: this.prebuffer.startIndex
    }

    // buffer is now empty
    this.buffer = {
      operation: undefined,
      childHash: this.buffer.childHash,
    }

    this._checkInvariants()

    return {
      kind: 'ClientUpdatePacket',
      edit: castPrebufferEdit(this.prebuffer),
      sourceUid: this.uid,
      docId: this.docId,
    }
  }

  handleUpdate(serverUpdate: ServerUpdatePacket)
  : ?ClientUpdatePacket {
    let op: ServerEdit = serverUpdate.edit
    let docId: string = serverUpdate.docId

    if (docId !== this.docId) {
      throw new Error('wat, different doc id', docId, this.docId)
    }

    if (op.startIndex !== this._nextIndex()) {
      throw new OutOfOrderUpdate({
        expected: this._nextIndex(),
        actual: op.startIndex
      })
    }

    if (this.prebuffer != null && op.id === this.prebuffer.id) {
      if (serverUpdate.sourceUid !== this.uid) {
        throw new Error('wat, different source')
      }

      // clear the prebuffer out
      this.prebuffer = {
        operation: undefined,
        id: U.genUid(),
        parentHash: op.childHash,
        startIndex: op.nextIndex
      }

      // undo & redo are already after the buffer
      return this._flushBuffer()

    } else {
      // transform the prebuffer & buffer & op
      let [newPrebufferEdit, newBufferEdit, appliedEdit, newState]
          = this.helper.transformAndApplyBuffers(this.prebuffer, this.buffer, op, this.state)

      // update undo
      this.undos = this.helper.transformEditsStack(appliedEdit, this.undos)
      this.redos = this.helper.transformEditsStack(appliedEdit, this.redos)

      // apply the operation
      this.state = newState

      // update prebuffer & buffer
      this.prebuffer = newPrebufferEdit
      this.buffer = newBufferEdit

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
      this.buffer = this.helper.compose([
        this.buffer,
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
      this.buffer = this.helper.compose([
        this.buffer,
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
    this.buffer = this.helper.compose([
      this.buffer,
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
