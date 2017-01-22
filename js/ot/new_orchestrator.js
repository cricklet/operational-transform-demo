/* @flow */

import type { ITransformer, IApplier } from './operations.js'
import { observeArray, observeEach } from './observe.js'
import { concat, flatten, maybePush, hash, clone, merge, last, genUid, zipPairs, first, pop, push, contains, reverse, findLastIndex, subarray, asyncWait } from './utils.js'
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

export class ContextualOperationHelper<O, S> {
  transformer: ITransformer<O>
  applier: IApplier<O,S>

  constructor(transformer: ITransformer<O>, applier: IApplier<O,S>) {
    this.transformer = transformer
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

    let composedOs: O[] = this.transformer.composeMany(map(o => o.subops, operations))
    return {
      subops: composedOs,
      operationId: genUid(),
      parentHash: first(operations).parentHash,
      childHash: last(operations).childHash,
    }
  }

  transform2nd (
    a: ContextualOperation<O>, // client op
    b: ContextualOperation<O>, // server op
    aT: ContextualOperation<O>
  ): ContextualOperation<O> { // returns bP
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (a.parentHash !== b.parentHash) {
      throw new Error('wat, parent hashes must match')
    }

    if (aT.parentHash !== b.childHash) {
      throw new Error('wat, aP isn\'t parented on b')
    }

    let [_aT, _bP] = this.transformer.transform(a.subops, b.subops)

    // TODO
    // if (_bP is not equal to bP) {
    //   throw new Error('algorithm wasn\'t symmetric')
    // }

    return {
      subops: _bP,
      operationId: genUid(),
      parentHash: a.childHash,
      childHash: aT.childHash,
    }
  }

  transform1st (
    a: ContextualOperation<O>, // client op
    b: ContextualOperation<O>, // server op
    bT: ContextualOperation<O>
  ): ContextualOperation<O> { // returns aP
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (a.parentHash !== b.parentHash) {
      throw new Error('wat, parent hashes must match')
    }

    if (bT.parentHash !== a.childHash) {
      throw new Error('wat, aP isn\'t parented on b')
    }

    let [_aT, _bT] = this.transformer.transform(a.subops, b.subops)

    // TODO
    // if (_aP is not equal to aP) {
    //   throw new Error('algorithm wasn\'t symmetric')
    // }

    return {
      subops: _aT,
      operationId: genUid(),
      parentHash: b.childHash,
      childHash: bT.childHash,
    }
  }

  transformOnClient (
    clientOp: ContextualOperation<O>, // client op
    serverOp: ContextualOperation<O>, // server op
    clientState: S
  ): [ContextualOperation<O>, ContextualOperation<O>, S] { // returns [aP, bP, newState]
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (clientOp.parentHash !== serverOp.parentHash) {
      throw new Error('wat, parent hashes must match')
    }

    let clientHash = this.applier.stateString(clientState)

    if (clientOp.childHash !== clientHash) {
      throw new Error('wat, client op should lead to client state')
    }

    let [a, b] = [clientOp, serverOp]
    let [aT, bT] = this.transformer.transform(a.subops, b.subops)

    let newState = this.applier.apply(clientState, bT)
    let newHash = this.applier.stateString(newState)

    return [
      {
        subops: aT,
        operationId: genUid(),
        parentHash: b.childHash,
        childHash: newHash,
      },
      {
        subops: bT,
        operationId: genUid(),
        parentHash: a.childHash,
        childHash: newHash,
      },
      newState
    ]
  }

  transformOnServer (
    clientOp: ContextualOperation<O>, // client op
    serverOp: ContextualOperation<O>, // server op
    serverState: S
  ): [ContextualOperation<O>, ContextualOperation<O>, S] { // returns [aP, bP, newState]
    //   a /\ b
    //    /  \
    // bP \  / aP
    //     \/

    if (clientOp.parentHash !== serverOp.parentHash) {
      throw new Error('wat, parent hashes must match')
    }

    let serverHash = this.applier.stateString(serverState)

    if (serverOp.childHash !== serverHash) {
      throw new Error('wat, server op should lead to server hash')
    }

    let [a, b] = [clientOp, serverOp]
    let [aT, bT] = this.transformer.transform(a.subops, b.subops)

    let newState = this.applier.apply(serverState, aT)
    let newHash = this.applier.stateString(newState)

    return [
      {
        subops: aT,
        operationId: genUid(),
        parentHash: b.childHash,
        childHash: newHash,
      },
      {
        subops: bT,
        operationId: genUid(),
        parentHash: a.childHash,
        childHash: newHash,
      },
      newState
    ]
  }
}

export class ClientOrchestrator<O,S> {
  client: Client<O,S>
  transformer: ITransformer<O>
  applier: IApplier<O,S>
  helper: ContextualOperationHelper<O,S>

  constructor(client: Client<O,S>, transformer: ITransformer<O>, applier: IApplier<O,S>) {
    this.transformer = transformer
    this.applier = applier
    this.client = client
    this.helper = new ContextualOperationHelper(transformer, applier)
  }

  _checkInvariants () {
    let clientState = this.client.state
    let clientStateHash = this.client.stateHash

    let prebuffer = this.client.sentOperation
    let buffer = this.client.bufferedOperation

    if (prebuffer.childHash !== buffer.parentHash) {
      throw new Error('prebuffer should point to buffer')
    }

    if (buffer.parentHash !== clientStateHash) {
      throw new Error('buffer should point to current state')
    }
  }

  handleServerBroadcast(serverBroadcast: ServerBroadcast<O>): void {
    let serverOp = serverBroadcast.operation

    let clientState = this.client.state
    let clientStateHash = this.client.stateHash

    if (this.client.prebuffer) {
      return // we're waiting for a response elsewhere... ignore this update
    }

    if (serverOp.parentHash !== clientStateHash) {
      throw new Error('wat')
    }

    let serverO = serverOp.subops

    let newState = this.applier.apply(clientState, serverO)
    let newStateHash = this.applier.stateString(newState)

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
    this.client.bufferedOperation = this.helper.empty(this.client.stateHash)

    this._checkInvariants()

    return editRequest
  }

  handleServerResponse(serverResponse: ServerEditResponse<O>): ?ClientEditRequest<O> {
    //         /\
    //      a /  \ b
    //       /    \
    //      /\bP  /
    //   c /  \  / aP
    //    /    \/
    //    \    /
    // bPP \  / cP
    //      \/

    let state = this.client.state
    let hash = this.client.stateHash

    let a = this.client.sentOperation
    let b = serverResponse.intermediateOperation
    let aP = serverResponse.transformedOperation
    let c = this.client.bufferedOperation

    if (a == null) {
      throw new Error('how are we getting an edit response w/o outgoing edit?')
    }

    if (a.operationId !== aP.operationId) {
      throw new Error('woah, we got back a different transformed op')
    }

    let bP = this.helper.transform2nd(a, b, aP)

    if (c == null) { // there are no buffered operations!
      let newState = this.applier.apply(state, bP.subops)
      let newHash = this.applier.stateString(newState)

      if (newHash != aP.childState || newHash != bP.childState) {
        throw new Error('we got to the wrong end state...')
      }

      this.client.state = newState
      this.client.stateHash = newHash

      // we finished handling the sent operation!!
      this.client.sentOperation = this.helper.empty(newHash)

    } else { // we have to transform the buffered operations!
      let [cP, bPP, newState] = this.helper.transformOnClient(c, bP, state)
      let newHash = this.applier.stateString(newState)

      if (newHash != bPP.childState || newHash != cP.childState) {
        throw new Error('we got to the wrong end state...')
      }

      this.client.state = newState
      this.client.stateHash = newHash

      // we finished handling the sent operation!!
      this.client.sentOperation = this.helper.empty(newHash)
    }

    return this._flushBuffer()
  }

  localEdit(ops: O[])
  : ?ClientEditRequest<O> { // return client op to broadcast
    // apply the operation
    let clientState = this.client.state
    let clientStateHash = this.client.stateHash

    let newState = this.applier.apply(clientState, ops)
    let newStateHash = this.applier.stateString(newState)

    this.client.state = newState

    // the op we just applied!
    let op: ContextualOperation<O> = {
      subops: ops,
      operationId: genUid(),
      parentHash: clientStateHash,
      childHash: newStateHash
    }

    // append operation to buffer (& thus bridge)
    if (this.client.bufferedOperation == null) {
      this.client.bufferedOperation = op
    } else {
      this.client.bufferedOperation = this.helper.composeFull([
        this.client.bufferedOperation,
        op
      ])
    }

    return this._flushBuffer()
  }
}

export class ServerOrchestrator<O,S> {
  server: Server<O,S>
  transformer: ITransformer<O>
  applier: IApplier<O,S>
  helper: ContextualOperationHelper<O,S>

  constructor(server: Server<O,S>, transformer: ITransformer<O>, applier: IApplier<O,S>) {
    this.transformer = transformer
    this.applier = applier
    this.server = server
    this.helper = new ContextualOperationHelper(transformer, applier)
  }

  _historySince(startHash: StateHash): Array<ContextualOperation<O>> {
    let endHash = this.applier.stateString(this.server.state)
    if (endHash === startHash) { return [] }

    let i = findLastIndex(o => o.parentHash === startHash, this.server.log)
    if (i == null) { throw new Error('wat') }

    let ops = Array.from(subarray(this.server.log, {start: i})())
    if (ops.length === 0) { throw new Error('wat') }

    if (first(ops).parentHash !== startHash) { throw new Error('wat') }
    if (last(ops).childHash !== endHash) { throw new Error('wat') }

    return ops
  }

  // handleClientRequest(clientRequest: ClientEditRequest<O>)
  // : [ServerEditResponse<O>, ServerBroadcast<O>] {
  //   //   a /\ b
  //   //    /  \
  //   // bP \  / aP
  //   //     \/
  //
  //   let clientOp = clientRequest.subops
  //
  //   let history: Array<ContextualOperation<O>> = this._historySince(clientOp.parentHash)
  //   if (history.length === 0) {
  //   }
  //   let historyOp: ContextualOperation<O> = this.helper.composeFull(history)
  //   transformedOp = this._serverTransform(clientOp, historyOp)
  // }

}
