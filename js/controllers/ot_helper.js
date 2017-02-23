/* @flow */

import type { Operation } from '../ot/types.js'

import * as Transformer from '../ot/transformer.js'

import * as U from '../helpers/utils.js'

import type {
  Edit,
  OutstandingEdit,
  BufferEdit,
  ServerEdit,
  EditsStack
} from './edit_types.js'

import {
  castOutstandingEdit,
  castBufferEdit,
} from './edit_types.js'

export interface IApplier<S> {
  initial(): S,
  stateHash(s: S): string,
  apply(state: S, operation: Operation): [S, Operation],
}


type AppliedEdit = {|
  operation: Operation,
  parentHash: string,
  childHash: string,
|}

export function castAppliedEdit(op: Edit, opts?: Object): AppliedEdit {
  op = U.merge(op, opts)
  if (!('operation' in op) || op.childHash == null || op.parentHash == null) {
    throw new Error('applied contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

// This class helps the controllers with the nitty-gritty of
// transforming operations.

// It's tightly coupled to the logic and expectations of the controllers!
// For example, it knows about how the client manages & stores outstandings
// and buffers.

function _createEdit(
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

export function compose(edits: Edit[]): Edit {
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
  if (firstEdit.startIndex != null) { edit.startIndex = firstEdit.startIndex }

  let lastEdit = U.last(edits)
  if (lastEdit.childHash != null) { edit.childHash = lastEdit.childHash }
  if (lastEdit.nextIndex != null) { edit.nextIndex = lastEdit.nextIndex }

  return edit
}

export function transformEditsStack(
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

function _applyNullable<S>(applier: IApplier<S>, state: S, o: ?Operation)
: [S, ?Operation] {
  if (o == null) {
    return [state, undefined]
  } else {
    let [newState, undo] = applier.apply(state, o)
    return [newState, undo]
  }
}

export function transformAndApplyToClient<S>(
  applier: IApplier<S>,
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

  let [aT, bT] = transform(a, b)

  let [newState, newUndo] = _applyNullable(applier, clientState, bT.operation)
  let newHash = applier.stateHash(newState)

  aT.childHash = newHash
  bT.childHash = newHash

  return [
    aT,
    bT,
    { operation: newUndo },
    newState
  ]
}

export function transformAndApplyToServer<S>(
  applier: IApplier<S>,
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

  let [aT, bT] = transform(a, b)

  let [newState, newUndo] = _applyNullable(applier, serverState, aT.operation)
  let newHash = applier.stateHash(newState)

  aT.childHash = newHash
  bT.childHash = newHash

  return [
    aT,
    bT,
    { operation: newUndo },
    newState
  ]
}

export function transformAndApplyBuffers<S>(
  applier: IApplier<S>,
  outstandingEdit: OutstandingEdit,
  bufferEdit: BufferEdit,
  serverEdit: ServerEdit,
  clientState: S
): [OutstandingEdit, BufferEdit, AppliedEdit, S] {
  // returns [newOutstanding, newBuffer, appliedEdit, newState]

  if (outstandingEdit.parentHash !== serverEdit.parentHash ||
      outstandingEdit.startIndex !== serverEdit.startIndex) {
    throw new Error('wat, to transform outstanding there must be the same parent')
  }

  // a: outstanding
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

  let [a, c, b] = [outstandingEdit, bufferEdit, serverEdit]

  let [aP, bP] = transform(a, b)
  let [cP, bPP, undo, newState] = transformAndApplyToClient(applier, c, bP, clientState)

  let newHash = applier.stateHash(newState)
  cP.childHash = newHash
  bPP.childHash = newHash

  let [newOutstandingEdit, newBufferEdit, appliedEdit] = [
    castOutstandingEdit(aP, { startIndex: serverEdit.nextIndex }),
    castBufferEdit(cP),
    castAppliedEdit(bPP)
  ]

  return [newOutstandingEdit, newBufferEdit, appliedEdit, newState]
}
export function transform(
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

  let aEditP = _createEdit(aP, {parent: bEdit, source: aEdit})
  let bEditP = _createEdit(bP, {parent: aEdit, source: bEdit})

  if (aEdit.id != null) { aEditP.id = aEdit.id }
  if (bEdit.id != null) { bEditP.id = bEdit.id }

  return [aEditP, bEditP]
}

export function isEmpty(
  edit: ServerEdit
): boolean {
  return edit.startIndex === edit.nextIndex
}
