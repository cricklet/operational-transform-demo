/* @flow */

import { observeArray, observeEach } from './observe.js'
import * as U from './utils.js'

export type ServerUpdate<O> = {
  kind: 'ServerUpdate'
} & ServerOperation<O>

export type ClientUpdate<O> = {
  kind: 'ClientUpdate',
} & PrebufferOperation<O>

type Operation<O> = $Shape<{
  id: string,

  ops: ?O[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number,
}>

type ServerOperation<O> = {
  id: string,

  ops: ?O[],

  parentHash: string,
  childHash: string,

  startIndex: number,
  nextIndex: number
}

type AppliedOperation<O> = {
  ops: ?O[],
  parentHash: string,
  childHash: string,
}

type BufferOperation<O> = {
  ops: ?O[],
  childHash: string
}

type PrebufferOperation<O> = {
  id: string,
  ops: ?O[],
  parentHash: string,
  startIndex: number
}

type OperationsStack<O> = {
  opsStack: Array<?O[]>, // oldest first
  parentHash: string
}

export class OutOfOrderServerUpdate extends Error {
  expectedIndex: number
  actualIndex: number
  constructor(indices: { expected: number, actual: number }) {
    super(`Expected ${indices.expected}, received ${indices.actual}.`)
    this.expectedIndex = indices.expected
    this.actualIndex = indices.actual
  }
}

function castServerOp<O>(op: Operation<O>, opts?: Object): ServerOperation<O> {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.id == null ||
      op.parentHash == null || op.childHash == null ||
      op.startIndex == null || op.nextIndex == null) {
    throw new Error('server op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

function castAppliedOp<O>(op: Operation<O>, opts?: Object): AppliedOperation<O> {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.childHash == null || op.parentHash == null) {
    throw new Error('applied contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

function castBufferOp<O>(op: Operation<O>, opts?: Object): BufferOperation<O> {
  op = U.merge(op, opts)
  if (!('ops' in op) || op.childHash == null) {
    throw new Error('buffer op contains keys: ' + Object.keys(op).join(', '))
  }
  return op
}

function castPrebufferOp<O>(op: Operation<O>, opts?: Object): PrebufferOperation<O> {
  op = U.merge(op, opts)
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
  /* @flow-ignore */
  return op
}

export function castClientUpdate<O>(obj: Object): ClientUpdate<O> {
  if (obj.kind !== 'ClientUpdate') {
    throw new Error('not a client update...')
  }
  let op = castPrebufferOp(obj)
  /* @flow-ignore */
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
      U.iterate(U.skipNulls(U.map(operations, o => o.ops))))

    let op: Operation<O> = {
      ops: composed,
    }

    let firstOp = U.first(operations)
    if (firstOp.parentHash != null) { op.parentHash = firstOp.parentHash }

    let lastOp = U.last(operations)
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
    for (let a: ?O[] of U.iterate(U.reverse(operationsStack.opsStack))) {
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

export class OTClient<O,S> {
  uid: string

  state: S

  buffer: BufferOperation<O>
  // the client ops not yet sent to the server.
  // sometimes we know the full state of this buffer (hence ParentedOperation<O>)
  // if the buffer has been transformed, we don't know the full state (hence $Shape)

  prebuffer: PrebufferOperation<O>
  // the client op that has been sent to the server (but not yet ACKd by the server)
  // together, prebuffer + buffer is the 'bridge'

  undos: OperationsStack<O>
  redos: OperationsStack<O>

  helper: OTHelper<O,S>

  constructor(helper: OTHelper<O,S>) {
    this.helper = helper

    this.uid = U.genUid()
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

  _flushBuffer(): ?ClientUpdate<O> {
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

    return U.merge({
      kind: 'ClientUpdate',
    }, this.prebuffer)
  }

  handleUpdate(serverUpdate: ServerUpdate<O>)
  : ?ClientUpdate<O> {
    let op: ServerOperation<O> = serverUpdate

    if (op.startIndex !== this._nextIndex()) {
      throw new OutOfOrderServerUpdate({
        expected: this._nextIndex(),
        actual: op.startIndex
      })
    }

    if (this.prebuffer != null && op.id === this.prebuffer.id) {
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

  performUndo(): ?ClientUpdate<O> {
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

  performRedo(): ?ClientUpdate<O> {
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

  performNullableEdit(edit: ?O[]): ?ClientUpdate<O> {
    if (edit == null) {
      return undefined
    }

    return this.performEdit(edit)
  }

  performEdit(edit: O[]): ?ClientUpdate<O> {
    // apply the operation
    let [newState, undo] = this.helper.apply(this.state, edit)
    this.state = newState

    return this.handleAppliedEdit(edit, undo)
  }

  handleAppliedEdit(edit: O[], undo: O[])
  : ?ClientUpdate<O> { // return client op to broadcast
    let currentHash = this.helper.hash(this.state)

    // the op we just applied!
    let op: BufferOperation<O> = {
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

export type OTServerDocument<O,S> = {
  state: S,
  log: Array<ServerOperation<O>>
}

export class OTServer<O,S> {
  uid: string
  doc: OTServerDocument<O,S>

  helper: OTHelper<O,S>

  constructor(
    helper: OTHelper<O,S>,
    doc?: OTServerDocument<O,S>
  ) {
    this.helper = helper

    this.uid = U.genUid()

    if (doc != null) {
      this.doc = doc
    } else {
      this.doc = {
        state: this.helper.initial(),
        log: []
      }
    }
  }

  /* @flow-ignore */
  get state(): S {
    return this.doc.state
  }

  _historySince(startIndex: number): Array<ServerOperation<O>> {
    let ops = U.array(U.subarray(this.doc.log, {start: startIndex}))
    if (ops.length === 0) { throw new Error('wat') }

    return ops
  }

  _historyOp(startIndex: number): Operation<O> {
    if (startIndex === this.doc.log.length) {
      return {
        ops: undefined,
        parentHash: this._hash(),
        childHash: this._hash()
      }
    } else if (startIndex < this.doc.log.length) {
      let ops: Operation<O>[] = U.array(U.subarray(this.doc.log, {start: startIndex}))
      if (ops.length === 0) { throw new Error('wat') }
      return this.helper.compose(ops)
    } else {
      throw new Error('wat ' + startIndex + ': ' + this.doc.log.join(', '))
    }
  }

  _hash(): string {
    return this.helper.hash(this.doc.state)
  }

  _nextIndex(): number {
    return this.doc.log.length
  }

  handleUpdate(update: ClientUpdate<O>)
  : ServerUpdate<O> { // return server op to broadcast
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientOp: PrebufferOperation<O> = update

    let historyOp: Operation<O> = this._historyOp(clientOp.startIndex)

    let [a, b] = [clientOp, historyOp]
    let [aP, bP, undo, newState] = this.helper.transformAndApplyToServer(a, b, this.doc.state)

    aP.startIndex = this._nextIndex()
    aP.nextIndex = aP.startIndex + 1

    this.doc.state = newState
    this.doc.log.push(aP)

    return U.merge({
      kind: 'ServerUpdate'
    }, castServerOp(aP))
  }
}
