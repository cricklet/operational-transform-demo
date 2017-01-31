/* @flow */

import type { IOperator, IApplier } from './operations.js'
import { observeArray, observeEach } from './observe.js'
import { concat, flatten, popRandom, maybePush, hash, clone, merge, last, genUid, zipPairs, first, pop, push, contains, reverse, findLastIndex, subarray, asyncWait } from './utils.js'
import { find, map, reject, filter } from 'wu'

type ContextualOperation<O> = {
  nextIndex: number,
  index: number,
  subops: O[],
  operationId: OperationId // id which stays the same throughout transforms
}

type SiteUid = string
type OperationId = string

// <server-url>/operations POST
//    client sends operation A, parented on S
//    server responds with all operations after S and A'

export type ClientEdit<O> = {
  kind: 'ClientEdit',
  operation: ContextualOperation<O>, // operation parented in server space
}

export type ServerEditResopnse<O> = {
  kind: 'ServerEditResopnse',
  intermediateOperation: ContextualOperation<O>,
  transformedOperation: ContextualOperation<O>,
}

export type ClientAck<O> = {
  kind: 'ClientAck',
  lastIndex: number // the last server op we've handled
}

export type ServerUpdate<O> = {
  kind: 'ServerUpdate',
  operation: ContextualOperation<O>,
}


//

export class ContextualOperator<O, S> {
  operator: IOperator<O>
  applier: IApplier<O,S>

  constructor(operator: IOperator<O>, applier: IApplier<O,S>) {
    this.operator = operator
    this.applier = applier
  }

  empty (index: number): ContextualOperation<O> {
    return {
      subops: [],
      operationId: genUid(),
      index: index,
      nextIndex: index
    }
  }

  composeFull (operations: ContextualOperation<O>[]): ContextualOperation<O> {
    if (operations.length === 0) {
      throw new Error('wat can\'t compose empty list')
    }

    // do some quick checks
    let index = first(operations).index
    for (let op of operations) {
      if (op.index !== index) {
        throw new Error('wat, indices out of order')
      }
      index = op.nextIndex
    }

    let composedOs: O[] = this.operator.composeMany(map(o => o.subops, operations))
    return {
      subops: composedOs,
      operationId: genUid(),
      index: first(operations).index,
      nextIndex: last(operations).nextIndex,
    }
  }

  transformServerOp (
    a: ContextualOperation<O>, // client op
    b: ContextualOperation<O>, // server op
    aT: ContextualOperation<O>,
  ): ContextualOperation<O> { // returns bT
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (a.index !== b.index) {
      throw new Error('wat, parent hashes must match')
    }

    let resultIndex = aT.nextIndex

    let [_aT, _bP] = this.operator.transform(a.subops, b.subops)

    return {
      subops: _bP,
      operationId: b.operationId,
      index: a.nextIndex,
      nextIndex: resultIndex,
    }
  }

  transformAndApply (
    clientOp: ContextualOperation<O>, // client op
    serverOp: ContextualOperation<O>, // server op
    params: {
      clientState?: S,
      serverState?: S,
    }
  ): [ContextualOperation<O>, ContextualOperation<O>, S] { // returns [aP, bP, newState]
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let [a, b] = [clientOp, serverOp]

    if (a.index !== b.index) {
      throw new Error('wat, parent hashes must match')
    }

    let [aT, bT] = this.operator.transform(a.subops, b.subops)

    let newState
    if (params.clientState != null) {
      newState = this.applier.apply(params.clientState, bT)
    } else if (params.serverState != null) {
      newState = this.applier.apply(params.serverState, aT)
    } else {
      throw new Error('need client or server state to apply transformed op to')
    }

    let newIndex
    if (clientOp.subops.length > 0) {
      newIndex = serverOp.nextIndex + 1
    } else {
      newIndex = serverOp.nextIndex
    }

    return [
      {
        subops: aT,
        operationId: a.operationId,
        index: b.nextIndex,
        nextIndex: newIndex,
      },
      {
        subops: bT,
        operationId: b.operationId,
        index: a.nextIndex,
        nextIndex: newIndex,
      },
      newState
    ]
  }
}

export class Client<O,S> {
  operator: ContextualOperator<O,S>
  applier: IApplier<O,S>

  uid: SiteUid

  state: S

  bufferedOperation: ContextualOperation<O>
  // the client ops not yet sent to the server.

  sentOperation: ContextualOperation<O>
  // the client op that has been sent to the server (but not yet ACKd).

  constructor(operator: ContextualOperator<O,S>, applier: IApplier<O,S>,
    data?: {
      uid: SiteUid,

      state: S,

      bufferedOperation: ContextualOperation<O>,
      // the client ops not yet sent to the server.

      sentOperation: ContextualOperation<O>,
      // the client op that has been sent to the server (but not yet ACKd).
    }
  ) {
    this.applier = applier
    this.operator = operator

    if (data == null) {
      let state = applier.initial()
      data = {
        uid: genUid(),
        state: state,
        bufferedOperation: operator.empty(0),
        sentOperation: operator.empty(0),
      }
    }

    Object.assign(this, data)
  }

  nextIndex(): number {
    return this.bufferedOperation.nextIndex
  }

  _checkInvariants () {
    let clientState = this.state

    let prebuffer = this.sentOperation
    let buffer = this.bufferedOperation

    if (prebuffer.nextIndex !== buffer.index) {
      throw new Error('prebuffer should point to buffer')
    }
  }

  handleServerBroadcast(serverBroadcast: ServerBroadcast<O>): void {
    let serverOp = serverBroadcast.operation

    let clientState = this.state

    if (this.sentOperation.subops.length > 0) {
      return // we're waiting for a response elsewhere... ignore this update
    }

    if (this.bufferedOperation.subops.length > 0) {
      throw new Error('wat, why buffer if there\'s no sent?')
    }

    if (serverOp.index !== this.nextIndex()) {
      throw new Error('wat') // figure out what to do!
    }

    this.sentOperation = this.operator.empty(serverOp.nextIndex)
    this.bufferedOperation = this.operator.empty(serverOp.nextIndex)
    this.state = this.applier.apply(clientState, serverOp.subops)
  }

  _flushBuffer(): ?ClientEdit<O> {
    // if there's no buffer, skip
    if (this.bufferedOperation.subops.length === 0) {
      return undefined
    }

    // if there is a prebuffer, skip
    if (this.sentOperation.subops.length > 0) {
      return undefined
    }

    // flush the buffer!
    let editRequest: ClientEdit<O> = {
      kind: 'ClientEdit',
      operation: this.bufferedOperation
    }

    // prebuffer is now the buffer
    this.sentOperation = this.bufferedOperation
    this.bufferedOperation = this.operator.empty(this.nextIndex())

    this._checkInvariants()

    return editRequest
  }

  handleServerResponse(serverResponse: ServerEditResopnse<O>): ?ClientEdit<O> {
    // client history is [a, c] where
    //   a: the op we've sent the server
    //   c: the op we've buffered and not yet sent to the server

    // server history is [b, aP] where
    //   b: an op executed on the server but not the client
    //   aP: the transformed version of a

    // we generate bPP to apply to the client state
    // cP is then sent to the server

    //         /\
    //      a /  \ b
    //       /    \
    //      /\bP  /
    //   c /  \  / aP
    //    /    \/
    //    \    /
    // bPP \  / cP
    //      \/

    let a = this.sentOperation
    let b = serverResponse.intermediateOperation
    let aP = serverResponse.transformedOperation
    let c = this.bufferedOperation

    let serverIndex = aP.nextIndex

    let clientState = this.state

    if (a == null) {
      throw new Error('how are we getting an edit response w/o outgoing edit?')
    }

    if (a.operationId !== aP.operationId) {
      throw new Error('woah, we got back a different transformed op')
    }

    // transform & apply!
    let bP = this.operator.transformServerOp(a, b, aP)
    let [cP, bPP, newState] = this.operator.transformAndApply(
      c, bP, { clientState: clientState })

    if (this.nextIndex() !== bPP.nextIndex || this.nextIndex() !== cP.nextIndex) {
      throw new Error('we got to the wrong end state...')
    }

    // update the new state
    this.state = newState

    // ack that we've handled the sent buffer
    this.sentOperation = this.operator.empty(cP.index)
    this.bufferedOperation = cP

    //

    this._checkInvariants()
    if (this.bufferedOperation.index !== serverIndex) {
      throw new Error('the buffer should now be parented on the server state')
    }

    // and send the buffer operation if we can
    return this._flushBuffer()
  }

  localEdit(ops: O[])
  : ?ClientEdit<O> { // return client op to broadcast
    // apply the operation
    let clientState = this.state
    let newState = this.applier.apply(clientState, ops)

    this.state = newState

    // the op we just applied!
    let op: ContextualOperation<O> = {
      subops: ops,
      operationId: genUid(),
      index: this.nextIndex(),
      nextIndex: this.nextIndex() + 1
    }

    // append operation to buffer (& thus bridge)
    this.bufferedOperation = this.operator.composeFull([
      this.bufferedOperation,
      op
    ])

    return this._flushBuffer()
  }
}

export class Server<O,S> {
  operator: ContextualOperator<O,S>
  applier: IApplier<O,S>

  uid: SiteUid

  state: S
  log: Array<ContextualOperation<O>> // history of operations, oldest to newest

  clientAckIndex: {[clientUid: SiteUid]: number}

  constructor(operator: ContextualOperator<O,S>, applier: IApplier<O,S>,
    data?: {
      uid: SiteUid,

      state: S,
      log: Array<ContextualOperation<O>>, // history of operations, oldest to newest
    }
  ) {
    this.operator = operator
    this.applier = applier

    if (data == null) {
      data = {
        uid: genUid(),
        state: applier.initial(),
        log: []
      }
    }

    Object.assign(this, data)
  }

  nextIndex(): number {
    return this.log.length
  }

  lastIndex(): number {
    return this.log.length - 1
  }

  _historyOp(startIndex: number): ContextualOperation<O> {
    if (startIndex === this.nextIndex()) {
      return this.operator.empty(startIndex)
    }

    let ops = Array.from(subarray(this.log, {start: startIndex})())
    if (ops.length === 0) { throw new Error('wat') }
    return this.operator.composeFull(ops)
  }

  handleClientEdit(clientRequest: ClientEdit<O>)
  : [ServerEditResopnse<O>, ServerBroadcast<O>] {
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientOp = clientRequest.operation

    let historyOp: ContextualOperation<O> = this._historyOp(clientOp.index)

    let [a, b] = [clientOp, historyOp]
    let [aP, bP, newState] = this.operator.transformAndApply(
      a, b, { serverState: this.state })

    this.state = newState
    this.log.push(aP)

    return [
      {
        kind: 'ServerEditResopnse',
        intermediateOperation: b,
        transformedOperation: aP
      },
      {
        kind: 'ServerBroadcast',
        operation: aP
      }
    ]
  }
}

type Packet<O,S> = {
  sourceUid: SiteUid,
  destinationUid: SiteUid,
  data: ServerEditResopnse<*>
      | ServerBroadcast<*>
      | ServerResetResponse<*>
      | ClientEdit<*>
}

export class NetworkSimulator<O,S> {
  clients: {[uid: SiteUid]: Client<O,S>}
  server: Server<O,S>

  packets: Packet<O,S>[]

  constructor(server: Server<O,S>) {
    this.clients = {}
    this.server = server
    this.packets = []
  }

  addClient(client: Client<O,S>) {
    this.clients[client.uid] = client
  }

  request(clientUid: SiteUid, clientRequest: ClientEdit<*>) {
    this.packets.push({
      data: clientRequest,
      sourceUid: clientUid,
      destinationUid: this.server.uid
    })
  }

  deliverPackets(num: number) {
    for (let i = 0; i < num; i ++) {
      if (this.packets.length === 0) { break }

      let packet: Packet<O,S> = popRandom(this.packets)
      for (let newPacket of this._handlePacket(packet)) {
        this.packets.push(newPacket)
      }
    }
  }

  dropPackets(num: number) {
    for (let i = 0; i < num; i ++) {
      if (this.packets.length === 0) { break }

      let packet: Packet<O,S> = popRandom(this.packets)
      // drop :(
    }
  }
}
