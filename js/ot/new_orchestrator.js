/* @flow */

import type { IOperator, IApplier } from './operations.js'
import { observeArray, observeEach } from './observe.js'
import { concat, flatten, popRandom, maybePush, hash, clone, merge, last, genUid, zipPairs, first, pop, push, contains, reverse, findLastIndex, subarray, asyncWait } from './utils.js'
import { find, map, reject, filter } from 'wu'

type ContextualOperation<O> = {
  childHash: StateHash,
  parentHash: StateHash,
  subops: O[],
  operationId: OperationId // id which stays the same throughout transforms
}

export type Client<O,S> = {
  uid: SiteUid,

  state: S,
  stateHash: StateHash,

  bufferedOperation: ContextualOperation<O>,
  // the client ops not yet sent to the server.

  sentOperation: ContextualOperation<O>,
  // the client op that has been sent to the server (but not yet ACKd).
}

export type Server<O,S> = {
  uid: SiteUid,

  state: S,
  log: Array<ContextualOperation<O>>, // history of operations, oldest to newest
}

type SiteUid = string
type StateHash = string
type OperationId = string

// <server-url>/operations POST
//    client sends operation A, parented on S
//    server responds with all operations after S and A'

export type ClientEditRequest<O> = {
  kind: 'ClientEditRequest',
  operation: ContextualOperation<O>, // operation parented in server space
}

export type ServerEditResponse<O> = {
  kind: 'ServerEditResponse',
  intermediateOperation: ContextualOperation<O>,
  transformedOperation: ContextualOperation<O>,
}

// server simply broadcasts operations as it receives them

export type ServerBroadcast<O> = {
  kind: 'ServerBroadcast',
  operation: ContextualOperation<O>,
}

// client can request a complete state reset

export type ClientResetRequest = {
  kind: 'ClientResetRequest'
}

export type ServerResetResponse<S> = {
  kind: 'ServerResetResponse',
  state: S
}

//

export class ContextualOperator<O, S> {
  operator: IOperator<O>
  applier: IApplier<O,S>

  constructor(operator: IOperator<O>, applier: IApplier<O,S>) {
    this.operator = operator
    this.applier = applier
  }

  empty (hash: StateHash): ContextualOperation<O> {
    return {
      subops: [],
      operationId: genUid(),
      parentHash: hash,
      childHash: hash
    }
  }

  composeFull (operations: ContextualOperation<O>[]): ContextualOperation<O> {
    if (operations.length === 0) {
      throw new Error('wat can\'t compose empty list')
    }

    let composedOs: O[] = this.operator.composeMany(map(o => o.subops, operations))
    return {
      subops: composedOs,
      operationId: genUid(),
      parentHash: first(operations).parentHash,
      childHash: last(operations).childHash,
    }
  }

  transform (
    a: ContextualOperation<O>, // client op
    b: ContextualOperation<O>, // server op
    params: {
      aT?: ContextualOperation<O>,
      bT?: ContextualOperation<O>,
    }
  ): [ContextualOperation<O>, ContextualOperation<O>] { // returns [aT, bT]
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (a.parentHash !== b.parentHash) {
      throw new Error('wat, parent hashes must match')
    }

    let [aT, bT] = [params.aT, params.bT]

    if (aT && bT) {
      throw new Error('wat, why are you transforming')
    }

    let resultHash
    if (aT) {
      resultHash = aT.childHash
    } else if (bT) {
      resultHash = bT.childHash
    } else {
      throw new Error('wat, you need to pass in one half of the transform')
    }

    let [_aT, _bP] = this.operator.transform(a.subops, b.subops)

    return [
      aT || {
        subops: _aT,
        operationId: a.operationId,
        parentHash: b.childHash,
        childHash: resultHash,
      },
      bT || {
        subops: _bP,
        operationId: b.operationId,
        parentHash: a.childHash,
        childHash: resultHash,
      }
    ]
  }

  transform2nd (
    a: ContextualOperation<O>, // client op
    b: ContextualOperation<O>, // server op
    aT: ContextualOperation<O>
  ): ContextualOperation<O> { // returns bP
    let [_aT, _bT] = this.transform(a, b, { aT: aT })
    return _bT
  }

  transform1st (
    a: ContextualOperation<O>, // client op
    b: ContextualOperation<O>, // server op
    bT: ContextualOperation<O>
  ): ContextualOperation<O> { // returns aP
    let [_aT, _bT] = this.transform(a, b, { bT: bT })
    return _aT
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

    if (a.parentHash !== b.parentHash) {
      throw new Error('wat, parent hashes must match')
    }

    let [aT, bT] = this.operator.transform(a.subops, b.subops)

    let newState, newHash
    if (params.clientState != null) {
      newState = this.applier.apply(params.clientState, bT)
      newHash = this.applier.stateHash(newState)
    } else if (params.serverState != null) {
      newState = this.applier.apply(params.serverState, aT)
      newHash = this.applier.stateHash(newState)
    } else {
      throw new Error('need client or server state to apply transformed op to')
    }

    return [
      {
        subops: aT,
        operationId: a.operationId,
        parentHash: b.childHash,
        childHash: newHash,
      },
      {
        subops: bT,
        operationId: b.operationId,
        parentHash: a.childHash,
        childHash: newHash,
      },
      newState
    ]
  }
}

export class ClientOrchestrator<O,S> {
  client: Client<O,S>
  operator: ContextualOperator<O,S>
  applier: IApplier<O,S>

  constructor(client: Client<O,S>, operator: ContextualOperator<O,S>, applier: IApplier<O,S>) {
    this.applier = applier
    this.operator = operator
    this.client = client
  }

  uid(): SiteUid {
    return this.client.uid
  }

  _checkInvariants () {
    let clientState = this.client.state
    let clientStateHash = this.client.stateHash

    let prebuffer = this.client.sentOperation
    let buffer = this.client.bufferedOperation

    if (prebuffer.childHash !== buffer.parentHash) {
      throw new Error('prebuffer should point to buffer')
    }

    if (buffer.childHash !== clientStateHash) {
      throw new Error('buffer should point to current state')
    }
  }

  handleServerBroadcast(serverBroadcast: ServerBroadcast<O>): void {
    let serverOp = serverBroadcast.operation

    let clientState = this.client.state
    let clientStateHash = this.client.stateHash

    if (this.client.sentOperation.subops.length > 0) {
      return // we're waiting for a response elsewhere... ignore this update
    }

    if (serverOp.childHash !== clientStateHash) {
      throw new Error('wat') // figure out what to do!
    }

    let serverO = serverOp.subops

    let newState = this.applier.apply(clientState, serverO)
    let newStateHash = this.applier.stateHash(newState)

    this.client.state = newState
    this.client.stateHash = newStateHash
  }

  _flushBuffer(): ?ClientEditRequest<O> {
    // if there's no buffer, skip
    if (this.client.bufferedOperation.subops.length === 0) {
      return undefined
    }

    // if there is a prebuffer, skip
    if (this.client.sentOperation.subops.length > 0) {
      return undefined
    }

    // flush the buffer!
    let editRequest: ClientEditRequest<O> = {
      kind: 'ClientEditRequest',
      operation: this.client.bufferedOperation
    }

    // prebuffer is now the buffer
    this.client.sentOperation = this.client.bufferedOperation
    this.client.bufferedOperation = this.operator.empty(this.client.stateHash)

    this._checkInvariants()

    return editRequest
  }

  handleServerResponse(serverResponse: ServerEditResponse<O>): ?ClientEditRequest<O> {
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

    let a = this.client.sentOperation
    let b = serverResponse.intermediateOperation
    let aP = serverResponse.transformedOperation
    let c = this.client.bufferedOperation

    let serverHash = aP.childHash

    let clientState = this.client.state
    let clientHash = this.client.stateHash

    if (a == null) {
      throw new Error('how are we getting an edit response w/o outgoing edit?')
    }

    if (a.operationId !== aP.operationId) {
      throw new Error('woah, we got back a different transformed op')
    }

    // transform & apply!
    let bP = this.operator.transform2nd(a, b, aP)
    let [cP, bPP, newState] = this.operator.transformAndApply(
      c, bP, { clientState: clientState })
    let newHash = this.applier.stateHash(newState)

    if (newHash !== bPP.childHash || newHash !== cP.childHash) {
      throw new Error('we got to the wrong end state...')
    }

    // update the new state
    this.client.state = newState
    this.client.stateHash = newHash

    // ack that we've handled the sent buffer
    this.client.sentOperation = this.operator.empty(aP.childHash)
    this.client.bufferedOperation = cP

    //

    this._checkInvariants()
    if (this.client.bufferedOperation.parentHash !== serverHash) {
      throw new Error('the buffer should now be parented on the server state')
    }

    // and send the buffer operation if we can
    return this._flushBuffer()
  }

  localEdit(ops: O[])
  : ?ClientEditRequest<O> { // return client op to broadcast
    // apply the operation
    let clientState = this.client.state
    let clientStateHash = this.client.stateHash

    let newState = this.applier.apply(clientState, ops)
    let newStateHash = this.applier.stateHash(newState)

    this.client.state = newState
    this.client.stateHash = newStateHash

    // the op we just applied!
    let op: ContextualOperation<O> = {
      subops: ops,
      operationId: genUid(),
      parentHash: clientStateHash,
      childHash: newStateHash
    }

    // append operation to buffer (& thus bridge)
    this.client.bufferedOperation = this.operator.composeFull([
      this.client.bufferedOperation,
      op
    ])

    return this._flushBuffer()
  }
}

export class ServerOrchestrator<O,S> {
  server: Server<O,S>
  operator: ContextualOperator<O,S>
  applier: IApplier<O,S>

  constructor(server: Server<O,S>, operator: ContextualOperator<O,S>, applier: IApplier<O,S>) {
    this.operator = operator
    this.applier = applier
    this.server = server
  }

  uid(): SiteUid {
    return this.server.uid
  }

  _historyBetween(startHash: StateHash, endHash: StateHash): Array<ContextualOperation<O>> {
    if (endHash === startHash) { return [] }

    let i = findLastIndex(o => o.parentHash === startHash, this.server.log)
    if (i == null) { throw new Error('wat') }

    let ops = Array.from(subarray(this.server.log, {start: i})())
    if (ops.length === 0) { throw new Error('wat') }

    if (first(ops).parentHash !== startHash) { throw new Error('wat') }
    if (last(ops).childHash !== endHash) { throw new Error('wat') }

    return ops
  }

  _historyOp(startHash: StateHash): ContextualOperation<O> {
    let endHash = this.applier.stateHash(this.server.state)
    if (endHash === startHash) {
      return this.operator.empty(endHash)
    } else {
      let historyOps = this._historyBetween(startHash, endHash)
      return this.operator.composeFull(historyOps)
    }
  }

  handleClientRequest(clientRequest: ClientEditRequest<O>)
  : [ServerEditResponse<O>, ServerBroadcast<O>] {
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    let clientOp = clientRequest.operation

    let historyOp: ContextualOperation<O> = this._historyOp(clientOp.parentHash)

    let [a, b] = [clientOp, historyOp]
    let [aP, bP, newState] = this.operator.transformAndApply(
      a, b, { serverState: this.server.state })

    this.server.state = newState
    this.server.log.push(aP)

    return [
      {
        kind: 'ServerEditResponse',
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
  data: ServerEditResponse<*>
      | ServerBroadcast<*>
      | ServerResetResponse<*>
      | ClientEditRequest<*>
}

export class NetworkSimulator<O,S> {
  clients: {[uid: SiteUid]: ClientOrchestrator<O,S>}
  server: ServerOrchestrator<O,S>

  packets: Packet<O,S>[]

  constructor(server: ServerOrchestrator<O,S>) {
    this.clients = {}
    this.server = server
    this.packets = []
  }

  addClient(client: ClientOrchestrator<O,S>) {
    this.clients[client.uid()] = client
  }

  request(clientUid: SiteUid, clientRequest: ClientEditRequest<*>) {
    this.packets.push({
      data: clientRequest,
      sourceUid: clientUid,
      destinationUid: this.server.uid()
    })
  }

  * _handlePacket (packet: Packet<O,S>): Iterator<Packet<O,S>> {
    let data = packet.data
    let originatingUid = packet.sourceUid
    let handlerUid = packet.destinationUid

    switch (data.kind) {
      case 'ClientEditRequest': {
        // handle it on the server
        let [response, broadcast] = this.server.handleClientRequest(data)

        // broadcast update to other clients
        for (let clientUid of Object.keys(this.clients)) {
          yield {
            sourceUid: handlerUid,
            destinationUid: clientUid,
            data: broadcast
          }
        }

        // send response to originating client
        yield {
          sourceUid: handlerUid,
          destinationUid: originatingUid,
          data: response
        }
        break
      }
      case 'ServerBroadcast': {
        // handle it on the client
        let client = this.clients[handlerUid]
        client.handleServerBroadcast(data)
        break
      }
      case 'ServerEditResponse': {
        // handle it on the client
        let client = this.clients[handlerUid]
        let request = client.handleServerResponse(data)
        if (request == null) { break }

        // send response to the server
        yield {
          sourceUid: handlerUid,
          destinationUid: originatingUid,
          data: request
        }
        break
      }
      default: {
        throw new Error('unknown packet')
      }
    }
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
