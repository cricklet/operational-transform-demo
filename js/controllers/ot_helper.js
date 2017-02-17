/* @flow */

import type { Operation } from '../ot/types.js'

import * as Transformer from '../ot/transformer.js'

import * as U from '../helpers/utils.js'

import type {
  Edit,
  PrebufferEdit,
  BufferEdit,
  ServerEdit,
  AppliedEdit,
  EditsStack
} from './types.js'

import {
  castPrebufferEdit,
  castBufferEdit,
  castAppliedEdit
} from './types.js'

export interface IApplier<S> {
  initial(): S,
  stateHash(s: S): string,
  apply(state: S, operation: Operation): [S, Operation],
}

export class OTHelper<S> {
  // This class helps the controllers with the nitty-gritty of
  // transforming operations.

  // It's tightly coupled to the logic and expectations of the controllers!
  // For example, it knows about how the client manages & stores prebuffers
  // and buffers.

  applier: IApplier<S>

  constructor(applier: IApplier<S>) {
    this.applier = applier
  }

  initial(): S {
    return this.applier.initial()
  }

  hash(s: S): string {
    return this.applier.stateHash(s)
  }

  apply(s: S, operation: Operation): [S, Operation] {
    return this.applier.apply(s, operation)
  }

  _createEdit(
    operation: ?Operation,
    optional: {
      parent?: Edit,
      source?: Edit,
      resultHash?: string
    }
  ): Edit {
    let edit: Edit = {operation: operation}

    if (optional.parent != null) {
      if (optional.parent.childHash != null) { edit.parentHash = optional.parent.childHash }
    }
    if (optional.source != null) {
      if (optional.source.id != null) { edit.id = optional.source.id }
    }
    if (optional.resultHash != null) { edit.childHash = optional.resultHash }

    return edit
  }

  compose(edits: Edit[]): Edit {
    if (edits.length === 0) {
      throw new Error('wat can\'t compose empty list')
    }

    let composed: Operation = Transformer.composeMany(
      U.skipNulls(U.map(edits, o => o.operation)))

    let edit: Edit = {
      operation: composed,
    }

    let firstEdit = U.first(edits)
    if (firstEdit.parentHash != null) { edit.parentHash = firstEdit.parentHash }

    let lastEdit = U.last(edits)
    if (lastEdit.childHash != null) { edit.childHash = lastEdit.childHash }

    return edit
  }

  transformEditsStack(
    appliedEdit: AppliedEdit,
    editsStack: EditsStack
  ): EditsStack {
    // a: stack op
    // b: applied op

    // aP: new stack op
    // bP: new applied op

    // p: b.parentHash
    // c: b.childHash

    //   a /p b
    //    /  \
    // bP \  c aP
    //     \/

    let parentHash = appliedEdit.parentHash
    let childHash = appliedEdit.childHash

    if (editsStack.parentHash !== parentHash) {
      throw new Error('stack ops must have the same parent as the applied op')
    }

    let transformedOps = []

    // iterate through the stack in reverse order
    // thus, the most recent ops are transformed first

    let b: ?Operation = appliedEdit.operation
    for (let a: ?Operation of U.reverse(editsStack.operationsStack)) {
      let [aP, bP] = Transformer.transformNullable(a, b)

      transformedOps.push(aP)
      b = bP
    }

    // because we iterated in reverse order, we have to reverse again
    transformedOps.reverse()

    return { operationsStack: transformedOps, parentHash: childHash }
  }

  applyNullable(
    state: S,
    o: ?Operation
  ): [S, ?Operation] {
    if (o == null) {
      return [state, undefined]
    } else {
      let [newState, undo] = this.applier.apply(state, o)
      return [newState, undo]
    }
  }

  transformAndApplyToClient(
    clientEdit: Edit,
    serverEdit: Edit,
    clientState: S
  ): [Edit, Edit, Edit, S] {
    // returns [aP, bP, undo, newState]

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let [a, b] = [clientEdit, serverEdit]

    let [aT, bT] = this.transform(a, b)

    let [newState, newUndo] = this.applyNullable(clientState, bT.operation)
    let newHash = this.applier.stateHash(newState)

    aT.childHash = newHash
    bT.childHash = newHash

    return [
      aT,
      bT,
      { operation: newUndo },
      newState
    ]
  }

  transformAndApplyToServer(
    clientEdit: Edit,
    serverEdit: Edit,
    serverState: S
  ): [Edit, Edit, Edit, S] {
    // returns [aP, bP, undo, newState]

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let [a, b] = [clientEdit, serverEdit]

    let [aT, bT] = this.transform(a, b)

    let [newState, newUndo] = this.applyNullable(serverState, aT.operation)
    let newHash = this.applier.stateHash(newState)

    aT.childHash = newHash
    bT.childHash = newHash

    return [
      aT,
      bT,
      { operation: newUndo },
      newState
    ]
  }

  transformAndApplyBuffers(
    prebufferEdit: PrebufferEdit,
    bufferEdit: BufferEdit,
    serverEdit: ServerEdit,
    clientState: S
  ): [PrebufferEdit, BufferEdit, AppliedEdit, S] {
    // returns [newPrebuffer, newBuffer, appliedEdit, newState]

    if (prebufferEdit.parentHash !== serverEdit.parentHash ||
        prebufferEdit.startIndex !== serverEdit.startIndex) {
      throw new Error('wat, to transform prebuffer there must be the same parent')
    }

    // a: prebuffer
    // c: buffer
    // b: server operation

    // s: client state

    //         /\
    //      a /  \ b
    //       /    \
    //      /\bP  /
    //   c /  \  / aP
    //    /    \/
    //    s    /
    // bPP \  / cP
    //      \/

    let [a, c, b] = [prebufferEdit, bufferEdit, serverEdit]

    let [aP, bP] = this.transform(a, b)
    let [cP, bPP, undo, newState] = this.transformAndApplyToClient(c, bP, clientState)

    let newHash = this.hash(newState)
    cP.childHash = newHash
    bPP.childHash = newHash

    let [newPrebufferEdit, newBufferEdit, appliedEdit] = [
      castPrebufferEdit(aP, { startIndex: serverEdit.nextIndex }),
      castBufferEdit(cP),
      castAppliedEdit(bPP)
    ]

    return [newPrebufferEdit, newBufferEdit, appliedEdit, newState]
  }
  transform(
    clientEdit: Edit,
    serverEdit: Edit
  ): [Edit, Edit] {
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (clientEdit.parentHash != null && serverEdit.parentHash != null &&
        clientEdit.parentHash !== serverEdit.parentHash) {
      throw new Error('wat, to transform, they must have the same parent')
    }

    let [aEdit,bEdit] = [clientEdit, serverEdit]
    let [a,b] = [aEdit.operation, bEdit.operation]

    let [aP,bP] = Transformer.transformNullable(a, b)

    let aEditP = this._createEdit(aP, {parent: bEdit, source: aEdit})
    let bEditP = this._createEdit(bP, {parent: aEdit, source: bEdit})

    if (aEdit.id != null) { aEditP.id = aEdit.id }
    if (bEdit.id != null) { bEditP.id = bEdit.id }

    return [aEditP, bEditP]
  }
}
