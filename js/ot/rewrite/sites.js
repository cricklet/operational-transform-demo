/* @flow */

import * as Operations from './operations'
import type { TextOperation } from './operations'
import { hash, clone, assign, merge, last, genUid, zipPairs, first, pop, push, contains } from '../utils.js'
import { autoFill } from '../observe.js'
import { find, map, reject } from 'wu'

export type Client = {
  kind: 'Client',
  uid: SiteUid,

  text: string,

  buffer: ?ChildedOperation, // the client ops not yet sent to the server
  prebuffer: ?ParentedOperation, // the client op that has been sent to the server (but not yet ACKd by the server)
  // together, prebuffer + buffer is the 'bridge'

  requests: Array<ServerRequest>, // pending requests
}

export type Server = {
  kind: 'Server',
  uid: SiteUid,

  text: string,

  log: Array<FullOperation>, // history of local operations, oldest to newest
  requests: Array<ClientRequest>, // pending requests
  parentToOperationLog: {[parentState: State]: FullOperation}
}

export type ServerRequest = {
  kind: 'ServerRequest',
  logIndex: number, // what is the index of this operation on the server's log
  operation: FullOperation
}

export type ClientRequest = {
  kind: 'ClientRequest',
  operation: FullOperation
}

export type FullOperation = {
  childState: State,
  parentState: State,
} & BaseOperation

export type ParentedOperation = {
  parentState: State, // what state is this parented on?
} & BaseOperation

export type ChildedOperation = {
  childState: State, // what state results from this op?
} & BaseOperation

export type StandaloneOperation = {
} & BaseOperation

export type BaseOperation = {
  operation: TextOperation,
  operationId: OperationId // id which stays the same throughout transforms
}

export type SiteUid = string
export type State = string
export type OperationId = string

export function generateServer (): Server {
  return {
    kind: 'Server',
    uid: genUid(),

    text: '',

    log: [],
    parentToOperationLog: {},
    requests: []
  }
}

export function generateClient (): Client {
  return {
    kind: 'Client',
    uid: genUid(),

    text: '',

    buffer: undefined, // the client ops not yet sent to the server
    prebuffer: undefined, // the client op that has been sent to the server (but not yet ACKd by the server)
    bridge: undefined, // server ops are transformed against this

    requests: [] // pending requests
  }
}

function generateBuffer(
  previousBuffer: ?ChildedOperation,
  nextOp: ChildedOperation
): ChildedOperation {
  if (previousBuffer != null) {
    return composeChilded([previousBuffer, nextOp])
  } else {
    return nextOp
  }
}

function serverTransform(clientOp: FullOperation, serverOp: FullOperation)
: ParentedOperation { // returns new op
  if (clientOp.parentState !== serverOp.parentState) {
    throw 'wat, to transform, they must have the same parent'
  }

  if (clientOp.childState !== serverOp.childState) {
    throw 'wat, to transform, they must diverge'
  }

  let [newO, _] = Operations.transform(clientOp.operation, serverOp.operation)

  return { // new operation to apply
    operationId: clientOp.operationId,
    parentState: serverOp.childState,
    operation: newO,
  }
}

function clientTransformWithBridge(bridgeOp: FullOperation, serverOp: FullOperation)
: [ParentedOperation, ParentedOperation] { // returns [new bridge, new op]
  if (bridgeOp.parentState !== serverOp.parentState) {
    throw 'wat, to transform with bridge, they must have the same parent'
  }

  let [newBridgeO, newO] = Operations.transform(bridgeOp.operation, serverOp.operation)
  return [
    { // bridge
      operationId: bridgeOp.operationId,
      parentState: serverOp.childState,
      operation: newBridgeO,
    },
    { // new op
      operationId: serverOp.operationId,
      parentState: bridgeOp.childState,
      operation: newO,
    }
  ]
}

function clientTransformBuffers(
  prebufferOp: ParentedOperation,
  bufferOp: StandaloneOperation,
  serverRequest: ServerRequest
): [ParentedOperation, StandaloneOperation] { // returns [newPrebuffer, newBuffer]
  let serverOp = serverRequest.operation
  // TODO check that log index has incremented

  if (prebufferOp.parentState !== serverOp.parentState) {
    throw 'wat, to transform prebuffer there must be the same parent'
  }

  let [newPrebufferO, newO] = Operations.transform(prebufferOp.operation, serverOp.operation)
  let [newBufferO, _] = Operations.transform(bufferOp.operation, newO)

  return [
    { // new prebuffer
      operation: newPrebufferO,
      parentState: serverOp.childState,
      operationId: prebufferOp.operationId
    },
    { // new buffer
      operation: newBufferO,
      operationId: bufferOp.operationId
    }
  ]
}

function historySince(server: Server, startState: string): Array<FullOperation> {
  let ops = []
  let parentState = startState

  while (true) {
    let nextOp: FullOperation = server.parentToOperationLog[parentState]
    if (nextOp == null) {
      break
    }

    ops.push(nextOp)
    parentState = nextOp.childState
  }

  if (parentState != hash(server.text)) {
    throw 'wat history is incomplete'
  }

  return ops
}

function compose <T: BaseOperation> (operations: T[]): BaseOperation {
  if (operations.length === 0) {
    throw 'wat can\'t compose empty list'
  }

  let composedOs = Operations.composeMany(map(o => o.operation, operations))
  return {
    operation: composedOs,
    operationId: genUid(),
  }
}

function composeChilded (operations: ChildedOperation[]): ChildedOperation {
  let composed: BaseOperation = compose(operations)
  return merge(composed, {
    kind: 'ChildedOperation',
    childState: last(operations).childState
  })
}

function composeParented (operations: ParentedOperation[]): ParentedOperation {
  let composed: BaseOperation = compose(operations)
  return merge(composed, {
    kind: 'ParentedOperation',
    parentState: first(operations).parentState
  })
}

function composeFull (operations: FullOperation[]): FullOperation {
  let composed: BaseOperation = compose(operations)
  return merge(composed, {
    kind: 'FullOperation',
    parentState: first(operations).parentState,
    childState: last(operations).childState
  })
}

export function serverRemoteOperation(server: Server, clientOp: FullOperation)
: ServerRequest { // return server op to broadcast
  // transform
  let history: Array<FullOperation> = historySince(server, clientOp.parentState)
  let transformedOp: ParentedOperation = clientOp
  if (history.length > 0) {
    let historyOp: FullOperation = composeFull(history)
    transformedOp = serverTransform(clientOp, historyOp)
  }

  // apply
  let parentState = hash(server.text)
  server.text = Operations.apply(server.text, clientOp.operation)
  let childState = hash(server.text)

  // save op
  let serverOp = {
    parentState: parentState,
    childState: childState,
    operation: transformedOp.operation,
    operationId: transformedOp.operationId
  }
  let logIndex = server.log.length
  server.log.push(serverOp)
  server.parentToOperationLog[serverOp.parentState] = serverOp

  // broadcast!
  return {
    kind: 'ServerRequest',
    logIndex: logIndex,
    operation: serverOp
  }
}

function clientLocalOperation(client: Client, o: TextOperation)
: ?ClientRequest { // return client op to broadcast
  // apply the operation
  let parentState = hash(client.text)
  client.text = Operations.apply(client.text, o)
  let childState = hash(client.text)

  // the op we just applied!
  let op = {
    operation: o,
    operationId: genUid(),
    parentState: parentState,
    childState: childState
  }

  // append operation to buffer (& thus bridge)
  client.buffer = generateBuffer(client.buffer, op)

  // if no prebuffer, then broadcast the buffer!
  if (client.prebuffer == null) {
    return {
      kind: 'ClientRequest',
      operation: {
        operationId: client.buffer.operationId,
        operation: client.buffer.operation,
        parentState: parentState,
        childState: childState,
      }
    }
  }

  return undefined
}

export function clientLocalInsert(client: Client, position: number, text: string)
: ?ClientRequest { // return client op to broadcast
  let o = Operations.generateInsert(position, text)
  return clientLocalOperation(client, o)
}

export function clientLocalDelete(client: Client, position: number, num: number)
: ?ClientRequest { // return client op to broadcast
  let o = Operations.generateDelete(position, num)
  return clientLocalOperation(client, o)
}
