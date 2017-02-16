/* @flowx */

import { merge, map, reiterable, skipNulls, first, last, reverse } from '../ot/utils.js'

export type ServerUpdate<O> = {
  sourceUid: string,
  docId: string,
  operation: ServerOperation<O>
}

export type ClientUpdate<O> = {
  sourceUid: string,
  docId: string,
  operation: PrebufferOperation<O>
}

export type Operation<O> = $Shape<{
  id: string,

  ops: ?O[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number,
}>

export type ServerOperation<O> = {
  id: string,

  ops: ?O[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number
}

export type AppliedOperation<O> = {
  ops: ?O[],
  parentHash: string,
  childHash: string,
}

export type BufferOperation<O> = {
  ops: ?O[],
  childHash: string
}

export type PrebufferOperation<O> = {
  id: string,
  ops: ?O[],
  parentHash: string,
  startIndex: number
}

export type OperationsStack<O> = {
  opsStack: Array<?O[]>, // oldest first
  parentHash: string
}

export function castServerOp<O>(op: Operation<O>, opts?: Object): ServerOperation<O> {
  op = merge(op, opts)
  if (!('ops' in op) || op.id == null ||
      op.parentHash == null || op.childHash == null ||
      op.startIndex == null || op.nextIndex == null) {
    throw new Error('server op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castAppliedOp<O>(op: Operation<O>, opts?: Object): AppliedOperation<O> {
  op = merge(op, opts)
  if (!('ops' in op) || op.childHash == null || op.parentHash == null) {
    throw new Error('applied contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castBufferOp<O>(op: Operation<O>, opts?: Object): BufferOperation<O> {
  op = merge(op, opts)
  if (!('ops' in op) || op.childHash == null) {
    throw new Error('buffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castPrebufferOp<O>(op: Operation<O>, opts?: Object): PrebufferOperation<O> {
  op = merge(op, opts)
  if (!('ops' in op) || op.id == null ||
      op.parentHash == null ||
      op.startIndex == null) {
    throw new Error('prebuffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

export function castServerUpdate<O>(obj: Object): ServerUpdate<O> {
  if (obj.kind !== 'ServerUpdate') {
    throw new Error('not a server broadcast...')
  }
  let op = castServerOp(obj)
  return op
}

export function castClientUpdate<O>(obj: Object): ClientUpdate<O> {
  if (obj.kind !== 'ClientUpdate') {
    throw new Error('not a client update...')
  }
  let op = castPrebufferOp(obj)
  return op
}

export interface IApplier<O,S> {
  initial(): S,
  stateHash(s: S): string,
  apply(state: S, ops: O[]): [S, O[]],
}

export interface ITransformer<O> {
  transformNullable(clientOps: ?O[], serverOps: ?O[]): [?O[], ?O[]],
  transform(clientOps: O[], serverOps: O[]): [O[], O[]],
  composeNullable (ops1: ?O[], ops2P: ?O[]): ?O[],
  compose(ops1: O[], ops2: O[]): O[],
  composeMany(ops: Iterable<O[]>): O[],
}


export class OTHelper<O,S> {
  applier: IApplier<O,S>
  transformer: ITransformer<O>

  constructor(transformer: ITransformer<O>, applier: IApplier<O,S>) {
    this.transformer = transformer
    this.applier = applier
  }

  initial(): S {
    return this.applier.initial()
  }

  hash(s: S): string {
    return this.applier.stateHash(s)
  }

  apply(s: S, ops: O[]): [S, O[]] {
    return this.applier.apply(s, ops)
  }

  _createOp(
    ops: ?O[],
    optional: {
      parent?: Operation<O>,
      source?: Operation<O>,
      resultHash?: string
    }
  ): Operation<O> {
    let op: Operation<O> = {ops: ops}

    if (optional.parent != null) {
      if (optional.parent.childHash != null) { op.parentHash = optional.parent.childHash }
    }
    if (optional.source != null) {
      if (optional.source.id != null) { op.id = optional.source.id }
    }
    if (optional.resultHash != null) { op.childHash = optional.resultHash }

    return op
  }

  compose(operations: Operation<O>[]): Operation<O> {
    if (operations.length === 0) {
      throw new Error('wat can\'t compose empty list')
    }

    let composed: O[] = this.transformer.composeMany(
      skipNulls(map(reiterable(operations), o => o.ops))()
    )

    let op: Operation<O> = {
      ops: composed,
    }

    let firstOp = first(operations)
    if (firstOp.parentHash != null) { op.parentHash = firstOp.parentHash }

    let lastOp = last(operations)
    if (lastOp.childHash != null) { op.childHash = lastOp.childHash }

    return op
  }

  transformOperationsStack(
    appliedOp: AppliedOperation<O>,
    operationsStack: OperationsStack<O>
  ): OperationsStack<O> {
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

    let b: ?O[] = appliedOp.ops
    for (let a: ?O[] of reverse(operationsStack.opsStack)()) {
      let [aP, bP] = this.transformer.transformNullable(a, b)

      transformedOps.push(aP)
      b = bP
    }

    // because we iterated in reverse order, we have to reverse again
    transformedOps.reverse()

    return { opsStack: transformedOps, parentHash: childHash }
  }

  applyNullable(
    state: S,
    o: ?O[]
  ): [S, ?O[]] {
    if (o == null) {
      return [state, undefined]
    } else {
      let [newState, undo] = this.applier.apply(state, o)
      return [newState, undo]
    }
  }

  transformAndApplyToClient(
    clientOp: Operation<O>,
    serverOp: Operation<O>,
    clientState: S
  ): [Operation<O>, Operation<O>, Operation<O>, S] {
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
    clientOp: Operation<O>,
    serverOp: Operation<O>,
    serverState: S
  ): [Operation<O>, Operation<O>, Operation<O>, S] {
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
    prebufferOp: PrebufferOperation<O>,
    bufferOp: BufferOperation<O>,
    serverOp: ServerOperation<O>,
    clientState: S
  ): [PrebufferOperation<O>, BufferOperation<O>, AppliedOperation<O>, S] {
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
    clientOp: Operation<O>,
    serverOp: Operation<O>
  ): [Operation<O>, Operation<O>] {
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

    let [aP,bP] = this.transformer.transformNullable(a, b)

    let aOpP = this._createOp(aP, {parent: bOp, source: aOp})
    let bOpP = this._createOp(bP, {parent: aOp, source: bOp})

    if (aOp.id != null) { aOpP.id = aOp.id }
    if (bOp.id != null) { bOpP.id = bOp.id }

    return [aOpP, bOpP]
  }
}
