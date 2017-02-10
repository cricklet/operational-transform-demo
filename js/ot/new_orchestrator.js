/* @flow */

import type { IOperator, IApplier } from './operations.js'
import { observeArray, observeEach } from './observe.js'
import { skipNulls, map, reiterable, concat, flatten, maybePush, hash, clone, merge, last, genUid, zipPairs, first, pop, push, contains, reverse, findLastIndex, subarray, asyncWait } from './utils.js'

export type ServerBroadcast<O> = {
  kind: 'ServerBroadcast',
  operation: ServerOperation<O>
}

export type ClientUpdate<O> = {
  kind: 'ClientUpdate',
  operation: PrebufferOperation<O>
}

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
  childHash: string,
}

type PrebufferOperation<O> = {
  id: string,
  ops: ?O[],
  parentHash: string,
  startIndex: number
}

type OperationsStack<O> = {
  operations: Array<{ ops: O[] }>,
  parentHash: string
}

export class OperationHelper<O,S> {
  operator: IOperator<O>
  applier: IApplier<O,S>

  constructor(operator: IOperator<O>, applier: IApplier<O,S>) {
    this.operator = operator
    this.applier = applier
  }

  hash(s: S): string {
    return this.applier.stateHash(s)
  }

  apply(s: S, ops: O[]): S {
    return this.applier.apply(s, ops)
  }

  castServer(op: Operation<O>, opts?: Object): ServerOperation<O> {
    op = merge(op, opts)
    if (!('ops' in op) || op.id == null ||
        op.parentHash == null || op.childHash == null ||
        op.startIndex == null || op.nextIndex == null) {
      throw new Error('server op contains keys: ' + Object.keys(op).join(', '))
    }
    return op
  }

  castApplied(op: Operation<O>, opts?: Object): AppliedOperation<O> {
    op = merge(op, opts)
    if (!('ops' in op) || op.childHash == null || op.parentHash == null) {
      throw new Error('applied contains keys: ' + Object.keys(op).join(', '))
    }
    return op
  }

  castBuffer(op: Operation<O>, opts?: Object): BufferOperation<O> {
    op = merge(op, opts)
    if (!('ops' in op) || op.childHash == null) {
      throw new Error('buffer op contains keys: ' + Object.keys(op).join(', '))
    }
    return op
  }

  castPrebuffer(op: Operation<O>, opts?: Object): PrebufferOperation<O> {
    op = merge(op, opts)
    if (!('ops' in op) || op.id == null ||
        op.parentHash == null ||
        op.startIndex == null) {
      throw new Error('prebuffer op contains keys: ' + Object.keys(op).join(', '))
    }
    return op
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

    let composed: O[] = this.operator.composeMany(
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

  transformAndApply (
    clientOp: Operation<O>, // client op
    serverOp: Operation<O>, // server op
    params: {
      clientState?: S,
      serverState?: S,
    }
  ): [Operation<O>, Operation<O>, S] { // returns [aP, bP, newState]
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let [a, b] = [clientOp, serverOp]

    if (a.parentHash != null && b.parentHash != null && a.parentHash !== b.parentHash) {
      throw new Error('wat, parent hashes must match')
    }

    let [aT, bT] = this.operator.transformNullable(a.ops, b.ops)

    let newState, newHash
    if (params.clientState != null) {
      newState = this.applier.applyNullable(params.clientState, bT)
      newHash = this.applier.stateHash(newState)
    } else if (params.serverState != null) {
      newState = this.applier.applyNullable(params.serverState, aT)
      newHash = this.applier.stateHash(newState)
    } else {
      throw new Error('need client or server state to apply transformed op to')
    }

    return [
      this._createOp(aT, {
        parent: b,
        source: a,
        resultHash: newHash
      }),
      this._createOp(bT, {
        parent: a,
        source: b,
        resultHash: newHash
      }),
      newState
    ]
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

    let [aP,bP] = this.operator.transformNullable(a, b)

    let aOpP = this._createOp(aP, {parent: bOp, source: aOp})
    let bOpP = this._createOp(bP, {parent: aOp, source: bOp})

    if (aOp.id != null) { aOpP.id = aOp.id }
    if (bOp.id != null) { bOpP.id = bOp.id }

    return [aOpP, bOpP]
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
    let [cP, bPP, newState] = this.transformAndApply(c, bP, {clientState: clientState})

    let newHash = this.hash(newState)
    cP.childHash = newHash
    bPP.childHash = newHash

    let [newPrebufferOp, newBufferOp, appliedOp] = [
      this.castPrebuffer(aP, { startIndex: serverOp.nextIndex }),
      this.castBuffer(cP),
      this.castApplied(bPP)
    ]

    return [newPrebufferOp, newBufferOp, appliedOp, newState]
  }

}

export class Client<O,S> {
  helper: OperationHelper<O,S>

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

  constructor(operator: IOperator<O>, applier: IApplier<O,S>) {
    this.helper = new OperationHelper(operator, applier)

    this.uid = genUid()
    this.state = applier.initial()

    let hash = this.helper.hash(this.state)

    this.buffer = {
      ops: undefined,
      childHash: hash
    }
    this.prebuffer = {
      startIndex: 0,
      parentHash: hash,
      ops: undefined,
      id: genUid()
    }
  }

  _checkInvariants () {
    let hash = this.helper.hash(this.state)

    if (this.buffer.childHash !== hash) {
      throw new Error('buffer should point to current state')
    }
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
      id: genUid(),
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
      kind: 'ClientUpdate',
      operation: this.prebuffer
    }
  }

  handleBroadcast(serverBroadcast: ServerBroadcast<O>)
  : ?ClientUpdate<O> {
    let op: ServerOperation<O> = serverBroadcast.operation

    if (this.prebuffer != null && op.id === this.prebuffer.id) {
      // clear the prebuffer out
      this.prebuffer = {
        ops: undefined,
        id: genUid(),
        parentHash: op.childHash,
        startIndex: op.nextIndex
      }

      return this._flushBuffer()

    } else {
      // transform the prebuffer & buffer & op
      let [newPrebufferOp, newBufferOp, appliedOp, newState]
          = this.helper.transformAndApplyBuffers(this.prebuffer, this.buffer, op, this.state)

      // apply the operation
      this.state = newState

      // update prebuffer & buffer
      this.prebuffer = newPrebufferOp
      this.buffer = newBufferOp

      return undefined
    }
  }

  handleEdit(edit: O[], undo?: O[]): ?ClientUpdate<O> {
    // apply the operation
    this.state = this.helper.apply(this.state, edit)

    return this.handleAppliedEdit(edit, undo)
  }

  handleAppliedEdit(edit: O[], undo?: O[])
  : ?ClientUpdate<O> { // return client op to broadcast
    // the op we just applied!
    let op: BufferOperation<O> = {
      ops: edit,
      childHash: this.helper.hash(this.state)
    }

    // append operation to buffer (& thus bridge)
    this.buffer = this.helper.compose([
      this.buffer,
      op
    ])

    return this._flushBuffer()
  }
}

export class Server<O,S> {
  helper: OperationHelper<O,S>

  uid: string

  state: S
  hash: string
  log: Array<ServerOperation<O>>

  constructor(operator: IOperator<O>, applier: IApplier<O,S>) {
    this.helper = new OperationHelper(operator, applier)

    this.uid = genUid()
    this.state = applier.initial()

    this.log = []
  }

  _historySince(startIndex: number): Array<ServerOperation<O>> {
    let ops = Array.from(subarray(this.log, {start: startIndex})())
    if (ops.length === 0) { throw new Error('wat') }

    return ops
  }

  _historyOp(startIndex: number): Operation<O> {
    if (startIndex === this.log.length) {
      return {
        ops: undefined,
        parentHash: this._hash(),
        childHash: this._hash()
      }
    } else if (startIndex < this.log.length) {
      let ops: Operation<O>[] = Array.from(subarray(this.log, {start: startIndex})())
      if (ops.length === 0) { throw new Error('wat') }
      return this.helper.compose(ops)
    } else {
      throw new Error('wat ' + startIndex + ': ' + this.log.join(', '))
    }
  }

  _hash(): string {
    return this.helper.hash(this.state)
  }

  _nextIndex(): number {
    return this.log.length
  }

  handleUpdate(update: ClientUpdate<O>)
  : ServerBroadcast<O> { // return server op to broadcast
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientOp: PrebufferOperation<O> = update.operation

    let historyOp: Operation<O> = this._historyOp(clientOp.startIndex)

    let [a, b] = [clientOp, historyOp]
    let [aP, bP, newState] = this.helper.transformAndApply(
      a, b, { serverState: this.state })

    aP.startIndex = this._nextIndex()
    aP.nextIndex = aP.startIndex + 1

    this.state = newState
    this.log.push(aP)

    return {
      kind: 'ServerBroadcast',
      operation: this.helper.castServer(aP)
    }
  }
}

export function generatePropogator <O,S> (
  server: Server<O,S>,
  clients: Array<Client<O,S>>
): (update: ?ClientUpdate<O>) => void {
  // This setups a fake network between a server & multiple clients.

  let toServer = []
  let toClients = []

  function propogateBroadcast (broadcast: ServerBroadcast<O>) {
    let updates = clients.map(
      client => client.handleBroadcast(broadcast))

    for (let update of updates) {
      if (update) {
        propogateUpdate(update)
      }
    }
  }

  function propogateUpdate (update: ClientUpdate<O>) {
    let broadcast = server.handleUpdate(update)
    propogateBroadcast(broadcast)
  }

  return (update) => {
    if (update) propogateUpdate(update)
  }
}
