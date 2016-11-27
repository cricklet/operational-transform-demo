/* @flow */

import * as Operations from './operations'
import type { TextOperation } from './operations'
import { hash, clone, assign, merge, last, genUid, zipPairs, first, pop, push, contains, reverse, findLastIndex, subarray } from '../utils.js'
import { autoFill } from '../observe.js'
import { find, map, reject } from 'wu'

export type Client = {
  kind: 'Client',
  uid: SiteUid,

  text: string,

  buffer: ?ChildedOperation, // the client ops not yet sent to the server
  prebuffer: ?ParentedOperation, // the client op that has been sent to the server (but not yet ACKd by the server)
  // together, prebuffer + buffer is the 'bridge'



  requestIndex: number
}

export type Server = {
  kind: 'Server',
  uid: SiteUid,

  text: string,

  log: Array<FullOperation>, // history of local operations, oldest to newest
}

export type ServerRequest = {
  kind: 'ServerRequest',
  index: number, // what is the index of this operation on the server's log
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

function generateState(text: string): State {
  return text
}

export function generateServer (): Server {
  return {
    kind: 'Server',
    uid: genUid(),

    text: '',

    log: [],
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

    requestIndex: 0,
  }
}

function serverTransform(clientOp: FullOperation, serverOp: FullOperation)
: ParentedOperation { // returns new op
  if (clientOp.parentState !== serverOp.parentState) {
    throw new Error('wat, to transform, they must have the same parent')
  }

  if (clientOp.childState === serverOp.childState) {
    throw new Error('wat, to transform, they must diverge')
  }

  let [newO, _] = Operations.transform(clientOp.operation, serverOp.operation)

  return { // new operation to apply
    operationId: clientOp.operationId,
    parentState: serverOp.childState,
    operation: newO,
  }
}

function clientTransformWithBuffers(
  prebufferOp: ?ParentedOperation,
  bufferOp: ?StandaloneOperation,
  serverOp: FullOperation
): [?ParentedOperation, ?ChildedOperation, StandaloneOperation] { // returns [newPrebuffer, newBuffer, newOp]
  if (prebufferOp && serverOp && prebufferOp.parentState !== serverOp.parentState) {
    throw new Error('wat, to transform prebuffer there must be the same parent')
  }

  let prebufferO: ?TextOperation = (prebufferOp || {}).operation
  let bufferO: ?TextOperation = (bufferOp || {}).operation
  let bridgeO: ?TextOperation = Operations.composeNullable(prebufferO, bufferO)
  let serverO: TextOperation = serverOp.operation

  let [newBridgeO, newO] = Operations.transformNullable(bridgeO, serverO)

  let [newPrebufferO, newPartialO] = Operations.transformNullable(prebufferO, serverO)
  let [newBufferO, __] = Operations.transformNullable(bufferO, newPartialO)

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

function historySince(server: Server, startState: string): Array<FullOperation> {
  let endState = generateState(server.text)
  if (endState === startState) { return [] }

  let i = findLastIndex(o => o.parentState === startState, server.log)
  if (i == null) { throw new Error('wat') }

  let ops = Array.from(subarray(server.log, {start: i})())
  if (ops.length === 0) { throw new Error('wat') }

  if (first(ops).parentState !== startState) { throw new Error('wat') }
  if (last(ops).childState !== endState) { throw new Error('wat') }

  return ops
}

function compose <T: BaseOperation> (operations: T[]): BaseOperation {
  if (operations.length === 0) {
    throw new Error('wat can\'t compose empty list')
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
    childState: last(operations).childState
  })
}

function composeParented (operations: ParentedOperation[]): ParentedOperation {
  let composed: BaseOperation = compose(operations)
  return merge(composed, {
    parentState: first(operations).parentState
  })
}

function composeFull (operations: FullOperation[]): FullOperation {
  let composed: BaseOperation = compose(operations)
  return merge(composed, {
    parentState: first(operations).parentState,
    childState: last(operations).childState
  })
}

export function serverRemoteOperation(server: Server, request: ClientRequest)
: ServerRequest { // return server op to broadcast
  // grab the requested operation
  let clientOp = request.operation

  // transform
  let history: Array<FullOperation> = historySince(server, clientOp.parentState)
  let transformedOp: ParentedOperation = clientOp
  if (history.length > 0) {
    let historyOp: FullOperation = composeFull(history)
    transformedOp = serverTransform(clientOp, historyOp)
  }

  if (transformedOp.parentState !== generateState(server.text)) {
    throw new Error('wat')
  }

  // apply
  let parentState = generateState(server.text)
  server.text = Operations.apply(server.text, transformedOp.operation)
  let childState = generateState(server.text)

  // save op
  let serverOp = {
    parentState: parentState,
    childState: childState,
    operation: transformedOp.operation,
    operationId: transformedOp.operationId
  }
  let logIndex = server.log.length
  server.log.push(serverOp)

  // broadcast!
  return {
    kind: 'ServerRequest',
    index: logIndex,
    operation: serverOp
  }
}

export function flushBuffer(bufferOp: ?ChildedOperation, bufferParent: State)
: [?ClientRequest, ?ParentedOperation] { // new request, new prebuffer
  if (bufferOp == null) {
    return [undefined, undefined]
  }

  let fullBufferOp = merge(bufferOp, { parentState: bufferParent })

  return [
    {
      kind: 'ClientRequest',
      operation: fullBufferOp
    },
    fullBufferOp
  ]
}

export function clientRemoteOperation(client: Client, request: ServerRequest)
: ?ClientRequest { // request to send to server
  let op = request.operation

  if (client.requestIndex !== request.index) {
    throw new Error('wat, out of order requests from the server')
  } else {
    client.requestIndex ++
  }

  if (client.prebuffer != null && op.operationId === client.prebuffer.operationId) {
    // this is the pre-buffer!
    let remotePrebuffer = op

    // flush the buffer!
    let [request, fullBuffer] = flushBuffer(client.buffer, remotePrebuffer.childState)

    // prebuffer is now the buffer
    client.prebuffer = fullBuffer
    client.buffer = undefined

    return request

  } else {
    // transform the prebuffer & buffer & op
    let [newPrebufferOp, newBufferOp, newOp]
        = clientTransformWithBuffers(client.prebuffer, client.buffer, op)

    // apply the operation
    let parentState = generateState(client.text)
    client.text = Operations.apply(client.text, newOp.operation)
    let childState = generateState(client.text)

    // update prebuffer & buffer
    client.prebuffer = newPrebufferOp
    client.buffer = newBufferOp

    return undefined
  }
}

export function clientLocalOperation(client: Client, o: TextOperation)
: ?ClientRequest { // return client op to broadcast
  // apply the operation
  let parentState = generateState(client.text)
  client.text = Operations.apply(client.text, o)
  let childState = generateState(client.text)

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
    client.buffer = composeChilded([client.buffer, op])
  }

  // if no prebuffer, then broadcast the buffer!
  if (client.prebuffer == null) {
    // flush the buffer!
    let [request, fullBuffer] = flushBuffer(client.buffer, parentState)

    // prebuffer is now the buffer
    client.prebuffer = fullBuffer
    client.buffer = undefined

    return request
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
