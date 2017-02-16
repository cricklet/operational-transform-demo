/* @flow */

import type { OpComponent } from '../operations/components.js'
import * as Transformer from '../operations/transformer.js'

import * as U from '../helpers/utils.js'

export type ServerUpdate = {
  kind: 'ServerUpdate',
  sourceUid: string,
  docId: string,
  operation: ServerOperation
}

export type ClientUpdate = {
  kind: 'ClientUpdate',
  sourceUid: string,
  docId: string,
  operation: PrebufferOperation
}

export type Operation = $Shape<{
  id: string,

  ops: ?OpComponent[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number,
}>

export type ServerOperation = {
  id: string,

  ops: ?OpComponent[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number
}

export type AppliedOperation = {
  ops: ?OpComponent[],
  parentHash: string,
  childHash: string,
}

export type BufferOperation = {
  ops: ?OpComponent[],
  childHash: string
}

export type PrebufferOperation = {
  id: string,
  ops: ?OpComponent[],
  parentHash: string,
  startIndex: number
}

export type OperationsStack = {
  opsStack: Array<?OpComponent[]>, // oldest first
  parentHash: string
}

export function castServerOp(op: Operation, opts?: Object): ServerOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.id == null ||
      op.parentHash == null || op.childHash == null ||
      op.startIndex == null || op.nextIndex == null) {
    throw new Error('server op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castAppliedOp(op: Operation, opts?: Object): AppliedOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.childHash == null || op.parentHash == null) {
    throw new Error('applied contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castBufferOp(op: Operation, opts?: Object): BufferOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.childHash == null) {
    throw new Error('buffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castPrebufferOp(op: Operation, opts?: Object): PrebufferOperation {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.id == null ||
      op.parentHash == null ||
      op.startIndex == null) {
    throw new Error('prebuffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export interface IApplier<S> {
  initial(): S,
  stateHash(s: S): string,
  apply(state: S, ops: OpComponent[]): [S, OpComponent[]],
}

export class OTHelper<S> {
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

  apply(s: S, ops: OpComponent[]): [S, OpComponent[]] {
    return this.applier.apply(s, ops)
  }

  _createOp(
    ops: ?OpComponent[],
    optional: {
      parent?: Operation,
      source?: Operation,
      resultHash?: string
    }
  ): Operation {
    let op: Operation = {ops: ops}

    if (optional.parent != null) {
      if (optional.parent.childHash != null) { op.parentHash = optional.parent.childHash }
    }
    if (optional.source != null) {
      if (optional.source.id != null) { op.id = optional.source.id }
    }
    if (optional.resultHash != null) { op.childHash = optional.resultHash }

    return op
  }

  compose(operations: Operation[]): Operation {
    if (operations.length === 0) {
      throw new Error('wat can\'t compose empty list')
    }

    let composed: OpComponent[] = Transformer.composeMany(
      U.skipNulls(U.map(operations, o => o.ops)))

    let op: Operation = {
      ops: composed,
    }

    let firstOp = U.first(operations)
    if (firstOp.parentHash != null) { op.parentHash = firstOp.parentHash }

    let lastOp = U.last(operations)
    if (lastOp.childHash != null) { op.childHash = lastOp.childHash }

    return op
  }

  transformOperationsStack(
    appliedOp: AppliedOperation,
    operationsStack: OperationsStack
  ): OperationsStack {
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

    let parentHash = appliedOp.parentHash
    let childHash = appliedOp.childHash

    if (operationsStack.parentHash !== parentHash) {
      throw new Error('stack ops must have the same parent as the applied op')
    }

    let transformedOps = []

    // iterate through the stack in reverse order
    // thus, the most recent ops are transformed first

    let b: ?OpComponent[] = appliedOp.ops
    for (let a: ?OpComponent[] of U.reverse(operationsStack.opsStack)) {
      let [aP, bP] = Transformer.transformNullable(a, b)

      transformedOps.push(aP)
      b = bP
    }

    // because we iterated in reverse order, we have to reverse again
    transformedOps.reverse()

    return { opsStack: transformedOps, parentHash: childHash }
  }

  applyNullable(
    state: S,
    o: ?OpComponent[]
  ): [S, ?OpComponent[]] {
    if (o == null) {
      return [state, undefined]
    } else {
      let [newState, undo] = this.applier.apply(state, o)
      return [newState, undo]
    }
  }

  transformAndApplyToClient(
    clientOp: Operation,
    serverOp: Operation,
    clientState: S
  ): [Operation, Operation, Operation, S] {
    // returns [aP, bP, undo, newState]

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let [a, b] = [clientOp, serverOp]

    let [aT, bT] = this.transform(a, b)

    let [newState, newUndo] = this.applyNullable(clientState, bT.ops)
    let newHash = this.applier.stateHash(newState)

    aT.childHash = newHash
    bT.childHash = newHash

    return [
      aT,
      bT,
      { ops: newUndo },
      newState
    ]
  }

  transformAndApplyToServer(
    clientOp: Operation,
    serverOp: Operation,
    serverState: S
  ): [Operation, Operation, Operation, S] {
    // returns [aP, bP, undo, newState]

    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let [a, b] = [clientOp, serverOp]

    let [aT, bT] = this.transform(a, b)

    let [newState, newUndo] = this.applyNullable(serverState, aT.ops)
    let newHash = this.applier.stateHash(newState)

    aT.childHash = newHash
    bT.childHash = newHash

    return [
      aT,
      bT,
      { ops: newUndo },
      newState
    ]
  }

  transformAndApplyBuffers(
    prebufferOp: PrebufferOperation,
    bufferOp: BufferOperation,
    serverOp: ServerOperation,
    clientState: S
  ): [PrebufferOperation, BufferOperation, AppliedOperation, S] {
    // returns [newPrebuffer, newBuffer, appliedOp, newState]

    if (prebufferOp.parentHash !== serverOp.parentHash ||
        prebufferOp.startIndex !== serverOp.startIndex) {
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

    let [a, c, b] = [prebufferOp, bufferOp, serverOp]

    let [aP, bP] = this.transform(a, b)
    let [cP, bPP, undo, newState] = this.transformAndApplyToClient(c, bP, clientState)

    let newHash = this.hash(newState)
    cP.childHash = newHash
    bPP.childHash = newHash

    let [newPrebufferOp, newBufferOp, appliedOp] = [
      castPrebufferOp(aP, { startIndex: serverOp.nextIndex }),
      castBufferOp(cP),
      castAppliedOp(bPP)
    ]

    return [newPrebufferOp, newBufferOp, appliedOp, newState]
  }
  transform(
    clientOp: Operation,
    serverOp: Operation
  ): [Operation, Operation] {
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (clientOp.parentHash != null && serverOp.parentHash != null &&
        clientOp.parentHash !== serverOp.parentHash) {
      throw new Error('wat, to transform, they must have the same parent')
    }

    let [aOp,bOp] = [clientOp, serverOp]
    let [a,b] = [aOp.ops, bOp.ops]

    let [aP,bP] = Transformer.transformNullable(a, b)

    let aOpP = this._createOp(aP, {parent: bOp, source: aOp})
    let bOpP = this._createOp(bP, {parent: aOp, source: bOp})

    if (aOp.id != null) { aOpP.id = aOp.id }
    if (bOp.id != null) { bOpP.id = bOp.id }

    return [aOpP, bOpP]
  }
}
