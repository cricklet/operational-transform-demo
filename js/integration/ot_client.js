/* @flow */

import * as U from '../ot/utils.js'

import type {
  BufferOperation,
  PrebufferOperation,
  OperationsStack,
  ClientUpdate,
  ServerUpdate,
  ServerOperation
} from './shared.js'

import {
  OTHelper,
  castPrebufferOp
} from './shared.js'

import type {
  Op
} from '../ot/operations.js'

export class OutOfOrderUpdate extends Error {
  expectedIndex: number
  actualIndex: number
  constructor(indices: { expected: number, actual: number }) {
    super(`Expected ${indices.expected}, received ${indices.actual}.`)
    this.expectedIndex = indices.expected
    this.actualIndex = indices.actual
  }
}

export class OTClient<S> {
  // This class maintains the state of the client, computes what updates
  // should be sent to the server (i.e. ClientUpdate), and applies
  // remote updates (i.e. ServerUpdate) to the local state.

  // OTClient {
  //   performEdit(operations: Op[]): ?ClientUpdate
  //   handleUpdate(serverUpdate: ServerUpdate): ?ServerUpdate
  // }

  // USAGE:

  // let clientModel = new OTClient(...)
  //
  // connection.on('update', (serverUpdate) => { // LISTEN for remote changes
  //   let clientUpdate = clientModel.handleUpdate(serverUpdate)
  //   connection.send(clientUpdate)
  // })
  //
  // let clientUpdate = clientModel.performEdit(['hello']) // SEND local changes
  // connection.send(clientUpdate)

  uid: string

  docId: string

  state: S

  buffer: BufferOperation
  // the client ops not yet sent to the server.
  // sometimes we know the full state of this buffer (hence ParentedOperation)
  // if the buffer has been transformed, we don't know the full state (hence $Shape)

  prebuffer: PrebufferOperation
  // the client op that has been sent to the server (but not yet ACKd by the server)
  // together, prebuffer + buffer is the 'bridge'

  undos: OperationsStack
  redos: OperationsStack

  helper: OTHelper<S>

  constructor(docId: string, helper: OTHelper<S>) {
    this.helper = helper

    this.uid = U.genUid()
    this.docId = docId
    this.state = this.helper.initial()

    let hash = this.helper.hash(this.state)

    this.buffer = {
      ops: undefined,
      childHash: hash
    }
    this.prebuffer = {
      startIndex: 0,
      parentHash: hash,
      ops: undefined,
      id: U.genUid()
    }
    this.undos = {
      opsStack: [],
      parentHash: hash
    }
    this.redos = {
      opsStack: [],
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

  _flushBuffer(): ?ClientUpdate {
    // if there's no buffer, skip
    if (this.buffer.ops == null) {
      return undefined
    }

    // if there is a prebuffer, skip
    if (this.prebuffer.ops != null) {
      return undefined
    }

    // prebuffer is now the buffer
    this.prebuffer = {
      ops: this.buffer.ops,
      id: U.genUid(),
      parentHash: this.prebuffer.parentHash,
      startIndex: this.prebuffer.startIndex
    }

    // buffer is now empty
    this.buffer = {
      ops: undefined,
      childHash: this.buffer.childHash,
    }

    this._checkInvariants()

    return {
      operation: castPrebufferOp(this.prebuffer),
      sourceUid: this.uid,
      docId: this.docId,
    }
  }

  handleUpdate(serverUpdate: ServerUpdate)
  : ?ClientUpdate {
    let op: ServerOperation = serverUpdate.operation
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
        ops: undefined,
        id: U.genUid(),
        parentHash: op.childHash,
        startIndex: op.nextIndex
      }

      // undo & redo are already after the buffer
      return this._flushBuffer()

    } else {
      // transform the prebuffer & buffer & op
      let [newPrebufferOp, newBufferOp, appliedOp, newState]
          = this.helper.transformAndApplyBuffers(this.prebuffer, this.buffer, op, this.state)

      // update undo
      this.undos = this.helper.transformOperationsStack(appliedOp, this.undos)
      this.redos = this.helper.transformOperationsStack(appliedOp, this.redos)

      // apply the operation
      this.state = newState

      // update prebuffer & buffer
      this.prebuffer = newPrebufferOp
      this.buffer = newBufferOp

      return undefined
    }
  }

  performUndo(): ?ClientUpdate {
    let currentHash = this.helper.hash(this.state)
    let undoHash = this.undos.parentHash

    if (undoHash !== currentHash) {
      throw new Error('undo must refer to current state')
    }

    while (this.undos.opsStack.length > 0) {
      // get the most recent undo
      let undo = this.undos.opsStack.pop()

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
        { ops: undo, childHash: newHash }
      ])

      // update undos
      this.undos.parentHash = newHash

      // update redos
      this.redos.opsStack.push(redo)
      this.redos.parentHash = newHash

      return this._flushBuffer()
    }
  }

  performRedo(): ?ClientUpdate {
    let currentHash = this.helper.hash(this.state)
    let redoHash = this.redos.parentHash

    if (redoHash !== currentHash) {
      throw new Error('redo must refer to current state')
    }

    while (this.redos.opsStack.length > 0) {
      // get the most recent redo
      let redo = this.redos.opsStack.pop()

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
        { ops: redo, childHash: newHash }
      ])

      // update undos
      this.undos.opsStack.push(undo)
      this.undos.parentHash = newHash

      // update redos
      this.redos.parentHash = newHash

      return this._flushBuffer()
    }
  }

  performNullableEdit(edit: ?Op[]): ?ClientUpdate {
    if (edit == null) {
      return undefined
    }

    return this.performEdit(edit)
  }

  performEdit(edit: Op[]): ?ClientUpdate {
    // apply the operation
    let [newState, undo] = this.helper.apply(this.state, edit)
    this.state = newState

    return this.handleAppliedEdit(edit, undo)
  }

  handleAppliedEdit(edit: Op[], undo: Op[])
  : ?ClientUpdate { // return client op to broadcast
    let currentHash = this.helper.hash(this.state)

    // the op we just applied!
    let op: BufferOperation = {
      ops: edit,
      childHash: currentHash
    }

    // append operation to buffer (& thus bridge)
    this.buffer = this.helper.compose([
      this.buffer,
      op
    ])

    // append operation to undo stack
    this.undos.opsStack.push(undo)
    this.undos.parentHash = currentHash

    // clear the redo stack
    this.redos.opsStack = []
    this.redos.parentHash = currentHash

    return this._flushBuffer()
  }
}
