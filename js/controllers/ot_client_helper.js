/* @flow */

import * as U from '../helpers/utils.js'

import type {
  BufferEdit,
  OutstandingEdit,
  EditsStack,
  ClientUpdateEvent,
  ClientRequestSetupEvent,
  ServerUpdateEvent,
  ServerFinishSetupEvent,
  ServerEdit,
  UpdateEdit
} from './types.js'

import { castOutstandingEdit, castBufferEdit, castUpdateEdit } from './types.js'
import * as OTHelper from './ot_helper.js'
import type { IApplier } from './ot_helper.js'
import type { Operation } from '../ot/types.js'

export class OTClientHelper<S> {
  // This class maintains the state of the client, computes what updates
  // should be sent to the server (i.e. ClientUpdateEvent), and applies
  // remote updates (i.e. ServerUpdateEvent) to the local state.

  // OTClientHelper {
  //   performEdit(edit: Operation): ?ClientUpdateEvent
  //   handleUpdate(serverUpdate: ServerUpdateEvent): ?ServerUpdateEvent
  // }

  // USAGE:

  // let client = new OTClientHelper(...)
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

  applier: IApplier<S>

  constructor(docId: string, applier: IApplier<S>) {
    this.applier = applier

    this.uid = U.genUid()
    this.docId = docId
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

  _sendOutstandingEdits(): ?ClientUpdateEvent {
    const updateEdit = castUpdateEdit(this.outstandingEdit)
    if (updateEdit == null) {
      return undefined
    }

    return {
      kind: 'ClientUpdateEvent',
      edit: updateEdit,
      sourceUid: this.uid,
      docId: this.docId,
    }
  }

  _flushBuffer(): ?ClientUpdateEvent {
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

  _shouldIgnoreUpdate(serverUpdate: ServerUpdateEvent) {
    let sourceUid = serverUpdate.sourceUid

    if (serverUpdate.opts.ignoreAtSource && sourceUid === this.uid) {
      return true
    }

    if (serverUpdate.opts.ignoreIfNotAtSource && sourceUid != null && sourceUid !== this.uid) {
      return true
    }

    return false
  }

  establishConnection(): ClientRequestSetupEvent {
    let updateEdit: ?UpdateEdit = castUpdateEdit(this.outstandingEdit)

    let request: ClientRequestSetupEvent = {
      kind: 'ClientRequestSetupEvent',
      nextIndex: this._nextIndex(),
      sourceUid: this.uid,
      docId: this.docId,
      edit: updateEdit
    }

    return request
  }

  handleConnection(connectionResponse: ServerFinishSetupEvent)
  : (ClientUpdateEvent | ClientRequestSetupEvent)[] {
    let docId: string = connectionResponse.docId

    if (docId !== this.docId) {
      throw new Error('wat, different doc id', docId, this.docId)
    }

    // we're up to date!
    if (connectionResponse.edits.length === 0) {
      return []
    }

    let startIndex = U.first(connectionResponse.edits).startIndex
    if (startIndex !== this._nextIndex()) {
      // we're still out of order?
      console.log(`received out of order... ${startIndex} != ${this._nextIndex()}
                  ${JSON.stringify(this)}`)
      return [this.establishConnection()]
    }

    // apply all the updates
    let responses = []
    for (let edit of connectionResponse.edits) {
      let response = this.handleUpdate({
        kind: 'ServerUpdateEvent',
        docId: docId,
        edit: edit,
        opts: {}
      })
      if (response != null) {
        responses.push(response)
      }
    }

    if (responses.length > 1) {
      throw new Error('there should only be one response...')
    }

    return responses
  }

  handleUpdate(serverUpdate: ServerUpdateEvent, _opts?: { enforceOrdering: boolean })
  : ?(ClientUpdateEvent | ClientRequestSetupEvent) {
    let opts = U.fillDefaults(_opts, { enforceOrdering: false })

    let op: ServerEdit = serverUpdate.edit
    let docId: string = serverUpdate.docId

    if (this._shouldIgnoreUpdate(serverUpdate)) {
      return undefined
    }

    if (docId !== this.docId) {
      throw new Error('wat, different doc id', docId, this.docId)
    }

    if (op.startIndex > this._nextIndex()) { // raise on future edits
      console.log(`received out of order edits:
                   client: ${JSON.stringify(this)}
                   server-update: ${JSON.stringify(serverUpdate)}`)
      return this.establishConnection()
    } else if (op.startIndex < this._nextIndex()) { // ignore old edits
      return undefined
    }

    return this.handleOrderedUpdate(serverUpdate)
  }

  handleOrderedUpdate(serverUpdate: ServerUpdateEvent)
  : ?ClientUpdateEvent {
    let op: ServerEdit = serverUpdate.edit
    let docId: string = serverUpdate.docId

    if (this._shouldIgnoreUpdate(serverUpdate)) {
      return undefined
    }

    if (docId !== this.docId) {
      throw new Error('wat, different doc id', docId, this.docId)
    }

    if (op.startIndex !== this._nextIndex()) {
      throw new Error(`Expected server update #${this._nextIndex()} instead of ${op.startIndex}.`)
    }

    // if ((op.id === this.outstandingEdit.id) !==
    //     (op.sourceUid === this.uid)) {
    //   throw new Error(`How is the id the same if the source uid is different..?`)
    // }

    if (this.outstandingEdit != null && op.id === this.outstandingEdit.id) {
      if (serverUpdate.sourceUid != null && serverUpdate.sourceUid !== this.uid) {
        throw new Error(`wat, different source
          ${JSON.stringify(serverUpdate, null, 2)}
          ${JSON.stringify(this, null, 2)}`)
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

      // update outstanding & buffer
      this.outstandingEdit = newOutstandingEdit
      this.bufferEdit = newBufferEdit

      return undefined
    }
  }

  performUndo(): ?ClientUpdateEvent {
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

  performRedo(): ?ClientUpdateEvent {
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

  performEdit(edit: Operation): ?ClientUpdateEvent {
    if (edit.length === 0) {
      return undefined
    }

    // apply the operation
    let [newState, undo] = this.applier.apply(this.state, edit)
    this.state = newState

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

  resendEdits(): ?ClientUpdateEvent {
    return this._sendOutstandingEdits()
  }
}
