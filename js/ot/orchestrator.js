/* @flow */

import type { ITransformer, IApplier } from './operations.js'
import { concat, flatten, maybePush, hash, clone, merge, last, genUid, zipPairs, first, pop, push, contains, reverse, findLastIndex, subarray } from './utils.js'
import { find, map, reject } from 'wu'
import type { Record } from './record'
import { generateRecordFactory } from './record'
import { List } from 'immutable'

export type Client<O,S> = Record<{
  uid: SiteUid,

  state: S,

  buffer: ?ChildedOperation<O>, // the client ops not yet sent to the server
  prebuffer: ?ParentedOperation<O>, // the client op that has been sent to the server (but not yet ACKd by the server)
  // together, prebuffer + buffer is the 'bridge'

  requestQueue: Array<ServerRequest<O>>,
  requestIndex: number
}>
const ClientFactory = generateRecordFactory(
  'uid', 'state', 'buffer', 'prebuffer', 'requestQueue', 'requestIndex')

export type Server<O,S> = Record<{
  uid: SiteUid,

  state: S,
  log: Array<FullOperation<O>>, // history of local operations, oldest to newest
}>
const ServerFactory = generateRecordFactory(
  'uid', 'state', 'log')

export type ServerRequest<O> = Record<{
  kind: 'ServerRequest',
  index: number, // what is the index of this operation on the server's log
  operation: FullOperation<O>
}>
const ServerRequestFactory = generateRecordFactory(
  'kind', 'index', 'operation')

export type ClientRequest<O> = Record<{
  kind: 'ClientRequest',
  operation: FullOperation<O>
}>
const ClientRequestFactory = generateRecordFactory(
  'kind', 'operation')

type FullOperation<O> = {
  childState: StateString,
  parentState: StateString,
} & BaseOperation<O>

type ParentedOperation<O> = {
  parentState: StateString, // what state is this parented on?
} & BaseOperation<O>

type ChildedOperation<O> = {
  childState: StateString, // what state results from this op?
} & BaseOperation<O>

type StandaloneOperation<O> = {
} & BaseOperation<O>

type BaseOperation<O> = {
  operation: O,
  operationId: OperationId // id which stays the same throughout transforms
}

type SiteUid = string
type StateString = string
type OperationId = string

export class Orchestrator<O,S> {
  transformer: ITransformer<O>
  applier: IApplier<O,S>

  constructor(transformer: ITransformer<O>, applier: IApplier<O,S>) {
    this.transformer = transformer
    this.applier = applier
  }

  _currentStateString(site: Server<O,S> | Client<O,S>): StateString {
    return this.applier.stateString(site.state)
  }

  _serverTransform(clientOp: FullOperation<O>, serverOp: FullOperation<O>)
  : ParentedOperation<O> { // returns new op
    if (clientOp.parentState !== serverOp.parentState) {
      throw new Error('wat, to transform, they must have the same parent')
    }

    let [newO, _] = this.transformer.transform(clientOp.operation, serverOp.operation)

    return { // new operation to apply
      operationId: clientOp.operationId,
      parentState: serverOp.childState,
      operation: newO,
    }
  }

  _clientTransformWithBuffers(
    prebufferOp: ?ParentedOperation<O>,
    bufferOp: ?StandaloneOperation<O>,
    serverOp: FullOperation<O>
  ): [?ParentedOperation<O>, ?ChildedOperation<O>, StandaloneOperation<O>] { // returns [newPrebuffer, newBuffer, newOp]
    if (prebufferOp && serverOp && prebufferOp.parentState !== serverOp.parentState) {
      throw new Error('wat, to transform prebuffer there must be the same parent')
    }

    let prebufferO: ?O = (prebufferOp || {}).operation
    let bufferO: ?O = (bufferOp || {}).operation
    let bridgeO: ?O = this.transformer.composeNullable(prebufferO, bufferO)
    let serverO: O = serverOp.operation

    let [newBridgeO, newO] = this.transformer.transformNullable(bridgeO, serverO)

    let [newPrebufferO, newPartialO] = this.transformer.transformNullable(prebufferO, serverO)
    let [newBufferO, __] = this.transformer.transformNullable(bufferO, newPartialO)

    // prebuffer begets prebuffer, buffer begets buffer, op always exists
    if ((newPrebufferO == null) !== (prebufferOp == null)) { throw new Error('wat') }
    if ((newBufferO == null) !== (bufferOp == null)) { throw new Error('wat') }
    if (newO == null) { throw new Error('wat') }

    let newPrebufferOp, newBufferOp, newOp

    if (prebufferOp) {
      newPrebufferOp = merge(prebufferOp, {
        operation: newPrebufferO,
        parentState: serverOp.childState,
      })
    }

    if (bufferOp) {
      newBufferOp = merge(bufferOp, {
        operation: newBufferO
      })
    }

    newOp = {
      operation: newO,
      operationId: serverOp.operationId
    }

    return [newPrebufferOp, newBufferOp, newOp]
  }

  _historySince(server: Server<O,S>, startState: StateString): Array<FullOperation<O>> {
    let endState = this._currentStateString(server)
    if (endState === startState) { return [] }

    let i = findLastIndex(o => o.parentState === startState, server.log)
    if (i == null) { throw new Error('wat') }

    let ops = Array.from(subarray(server.log, {start: i})())
    if (ops.length === 0) { throw new Error('wat') }

    if (first(ops).parentState !== startState) { throw new Error('wat') }
    if (last(ops).childState !== endState) { throw new Error('wat') }

    return ops
  }

  _compose <T: BaseOperation<O>> (operations: T[]): BaseOperation<O> {
    if (operations.length === 0) {
      throw new Error('wat can\'t compose empty list')
    }

    let composedOs = this.transformer.composeMany(map(o => o.operation, operations))
    return {
      operation: composedOs,
      operationId: genUid(),
    }
  }

  _composeChilded (operations: ChildedOperation<O>[]): ChildedOperation<O> {
    let composed: BaseOperation<O> = this._compose(operations)
    return merge(composed, {
      childState: last(operations).childState
    })
  }

  _composeParented (operations: ParentedOperation<O>[]): ParentedOperation<O> {
    let composed: BaseOperation<O> = this._compose(operations)
    return merge(composed, {
      parentState: first(operations).parentState
    })
  }

  _composeFull (operations: FullOperation<O>[]): FullOperation<O> {
    let composed: BaseOperation<O> = this._compose(operations)
    return merge(composed, {
      parentState: first(operations).parentState,
      childState: last(operations).childState
    })
  }

  serverRemoteOperation(server: Server<O,S>, request: ClientRequest<O>)
  : ServerRequest<O> { // return server op to broadcast
    // grab the requested operation
    let clientOp = request.operation

    // transform
    let history: Array<FullOperation<O>> = this._historySince(server, clientOp.parentState)
    let transformedOp: ParentedOperation<O> = clientOp
    if (history.length > 0) {
      let historyOp: FullOperation<O> = this._composeFull(history)
      transformedOp = this._serverTransform(clientOp, historyOp)
    }

    // apply
    let parentState = this._currentStateString(server)
    if (transformedOp.parentState !== parentState) { throw new Error() }
    server.state = this.applier.apply(server.state, transformedOp.operation)
    let childState = this._currentStateString(server)

    // save op
    let serverOp: FullOperation<O> = {
      parentState: parentState,
      childState: childState,
      operation: transformedOp.operation,
      operationId: transformedOp.operationId
    }
    let logIndex = server.log.length
    server.log.push(serverOp)

    // broadcast!
    let serverRequest: ServerRequest<O> = ServerRequestFactory({
      kind: 'ServerRequest',
      operation: serverOp
    })

    return serverRequest
  }

  _flushBuffer(bufferOp: ?ChildedOperation<O>, bufferParent: StateString)
  : [?ClientRequest<O>, ?ParentedOperation<O>] { // new request, new prebuffer
    if (bufferOp == null) {
      return [undefined, undefined]
    }

    let fullBufferOp = merge(bufferOp, { parentState: bufferParent })
    let clientRequest: ClientRequest<O> = ClientRequestFactory({
      kind: 'ClientRequest',
      operation: fullBufferOp
    })

    return [
      clientRequest,
      fullBufferOp
    ]
  }

  _clientHandleRequest(client: Client<O,S>, serverRequest: ServerRequest<O>)
  : ?ClientRequest<O> {
    let op = serverRequest.operation

    if (client.prebuffer != null && op.operationId === client.prebuffer.operationId) {
      // this is the pre-buffer!
      let remotePrebuffer = op

      // flush the buffer!
      let [request, fullBuffer] = this._flushBuffer(client.buffer, remotePrebuffer.childState)

      // prebuffer is now the buffer
      client.prebuffer = fullBuffer
      client.buffer = undefined

      return request

    } else {
      // transform the prebuffer & buffer & op
      let [newPrebufferOp, newBufferOp, newOp]
          = this._clientTransformWithBuffers(client.prebuffer, client.buffer, op)

      // apply the operation
      let parentState = this._currentStateString(client)
      client.state = this.applier.apply(client.state, newOp.operation)
      let childState = this._currentStateString(client)

      // update prebuffer & buffer
      client.prebuffer = newPrebufferOp
      client.buffer = newBufferOp

      return undefined
    }
  }

  _clientHandleRequests(client: Client<O,S>): Array<ClientRequest<O>> {
    let clientRequests = []

    while (true) {
      let nextServerRequest: ?ServerRequest<O> = pop(
        client.requestQueue,
        r => r.index === client.requestIndex)

      if (nextServerRequest == null) {
        break
      }

      if (client.requestIndex !== nextServerRequest.index) {
        throw new Error('wat out of order')
      } else {
        // record that we're handling this request
        client.requestIndex ++
      }

      let clientRequest: ?ClientRequest<O> = this._clientHandleRequest(client, nextServerRequest)
      if (clientRequest != null) {
        clientRequests.push(clientRequest)
      }
    }

    return clientRequests
  }

  clientRemoteOperation(client: Client<O,S>, serverRequest: ServerRequest<O>)
  : Array<ClientRequest<O>> { // request to send to server
    // queue request
    client.requestQueue.push(serverRequest)

    // handle all requests
    return this._clientHandleRequests(client)
  }

  clientLocalOperation(client: Client<O,S>, o: O)
  : ?ClientRequest<O> { // return client op to broadcast
    // apply the operation
    let parentState = this._currentStateString(client)
    client.state = this.applier.apply(client.state, o)
    let childState = this._currentStateString(client)

    // the op we just applied!
    let op = {
      operation: o,
      operationId: genUid(),
      parentState: parentState,
      childState: childState
    }

    // append operation to buffer (& thus bridge)
    if (client.buffer == null) {
      client.buffer = op
    } else {
      client.buffer = this._composeChilded([client.buffer, op])
    }

    // if no prebuffer, then broadcast the buffer!
    if (client.prebuffer == null) {
      // flush the buffer!
      let [request, fullBuffer] = this._flushBuffer(client.buffer, parentState)

      // prebuffer is now the buffer
      client.prebuffer = fullBuffer
      client.buffer = undefined

      return request
    }

    return undefined
  }
}

export function generateServer <O,S> (initialState: S): Server<O,S> {
  let server: Server<O,S> = ServerFactory({
    uid: genUid(),
    state: initialState,
    log: [],
  })
  return server
}

export function generateClient <O,S> (initialState: S): Client<O,S> {
  let client: Client<O,S> = ClientFactory({
    uid: genUid(),
    state: initialState,

    buffer: undefined, // the client ops not yet sent to the server
    prebuffer: undefined, // the client op that has been sent to the server (but not yet ACKd by the server)

    requestQueue: [],
    requestIndex: 0,
  })
  return client
}

export function generateAsyncPropogator <O,S> (
  orchestrator: Orchestrator<O,S>,
  server: Server<O,S>,
  clients: Array<Client<O,S>>,
  logger: ((...xs: Array<?any>) => void)
): (r: ?ClientRequest<O>) => void {
  function propogateFromServer (serverRequest: ServerRequest<O>) {
    logger('\n\nPROPOGATING SERVER REQUEST', serverRequest.operation.operationId, serverRequest.operation, '\n')

    for (let client of clients) {
      setTimeout(() => {
        let clientRequests = orchestrator.clientRemoteOperation(client, serverRequest)
        for (let clientRequest of clientRequests) {
          setTimeout(() => {
            propogateFromClient(clientRequest)
          }, Math.random() * 1000)
        }
      }, Math.random() * 1000)
    }
  }
  function propogateFromClient (clientRequest: ClientRequest<O>) {
    logger('\n\nPROPOGATING CLIENT REQUEST', clientRequest.operation.operationId, clientRequest.operation, '\n')

    setTimeout(() => {
      let serverRequest = orchestrator.serverRemoteOperation(server, clientRequest)
      setTimeout(() => {
        propogateFromServer(serverRequest)
      }, Math.random() * 1000)
    }, Math.random() * 1000)
  }
  return (clientRequest: ?ClientRequest<O>) => {
    if (clientRequest == null) {
      return
    }

    let printClients = () => {
      for (let c of clients) {
        logger("CLIENT", c.uid)
        logger('prebuffer',c.prebuffer)
        logger('buffer',c.buffer)
        logger('state',c.state)
      }
    }
    let printServer = () => {
      logger("SERVER")
      for (let l of server.log) {
        logger(l)
      }
    }
    logger('\n\nSTART\n')
    printClients()
    printServer()

    propogateFromClient(clientRequest)

    logger('\n\nEND\n')
    printClients()
    printServer()
  }
}

export function generatePropogator <O,S> (
  orchestrator: Orchestrator<O,S>,
  server: Server<O,S>,
  clients: Array<Client<O,S>>
): (r: ?ClientRequest<O>) => void {
  function propogateFromServer (serverRequest: ?ServerRequest<O>) {
    if (serverRequest == null) { return }

    let clientRequests = []

    for (let client of clients) {
      clientRequests = concat(clientRequests, orchestrator.clientRemoteOperation(client, serverRequest))
    }

    for (let clientRequest of clientRequests) {
      propogateFromClient(clientRequest)
    }
  }

  function propogateFromClient (request: ?ClientRequest<O>) {
    if (request == null) { return }
    propogateFromServer(orchestrator.serverRemoteOperation(server, request))
  }

  return propogateFromClient
}
