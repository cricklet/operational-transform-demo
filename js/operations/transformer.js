/* @flow */

import * as O from './operations.js'
import type {
  Insert, Remove, Retain, Op
} from './operations.js'

import * as U from '../helpers/utils.js'

function _transformConsumeOps(a: ?Op, b: ?Op)
: [[?Op, ?Op], [?Op, ?Op]] {
  // returns [[aP, bP], [a, b]]

  if (a != null && O.isInsert(a)) {
    return [
      [a, O.retainOp(a)],
      [undefined, b]
    ]
  }

  if (b != null && O.isInsert(b)) {
    return [
      [O.retainOp(b), b],
      [a, undefined]
    ]
  }

  // neither is null
  if (a != null && b != null) {
    let minLength = Math.min(O.length(a), O.length(b))

    let [aHead, aTail] = O.split(a, minLength)
    let [bHead, bTail] = O.split(b, minLength)

    if (O.length(aHead) === 0) { aHead = undefined }
    if (O.length(aTail) === 0) { aTail = undefined }
    if (O.length(bHead) === 0) { bHead = undefined }
    if (O.length(bTail) === 0) { bTail = undefined }

    if (O.isRetain(a) && O.isRetain(b)) {
      return [[aHead, bHead], [aTail, bTail]]
    }
    if (O.isRemove(a) && O.isRetain(b)) {
      return [[aHead, undefined], [aTail, bTail]]
    }
    if (O.isRetain(a) && O.isRemove(b)) {
      return [[undefined, bHead], [aTail, bTail]]
    }
    if (O.isRemove(a) || O.isRemove(b)) {
      return [[undefined, undefined], [aTail, bTail]] // both do the same thing
    }
    if (O.isInsert(a) || O.isInsert(b)) {
      throw new Error('wat, should be handled already')
    }
    throw new Error('wat')
  }

  // one is null
  if (a != null) { return [[a, undefined], [undefined, b]] }
  if (b != null) { return [[undefined, b], [a, undefined]] }

  throw new Error('wat')
}

export function transformNullable(clientOps: ?Op[], serverOps: ?Op[])
: [?Op[], ?Op[]] {
  if (clientOps != null && serverOps != null) {
    let [newClientOps, newServerOps] = transform(clientOps, serverOps)
    return [newClientOps, newServerOps]
  } else {
    return [clientOps, serverOps]
  }
}

export function transform(clientOps: Op[], serverOps: Op[])
: [Op[], Op[]] {
  let ops1 = clientOps
  let ops2 = serverOps

  let ops1P = []
  let ops2P = []

  let i1 = 0
  let i2 = 0

  let op1: ?Op = undefined
  let op2: ?Op = undefined

  while (true) {
    if (op1 == null) { op1 = ops1[i1]; i1++ }
    if (op2 == null) { op2 = ops2[i2]; i2++ }

    if (op1 == null && op2 == null) { break }

    if ((op1 != null && O.length(op1) <= 0)) {
      op1 = null;
      continue
    }

    if ((op2 != null && O.length(op2) <= 0)) {
      op2 = null;
      continue
    }

    let [[op1P, op2P], [newOp1, newOp2]] = _transformConsumeOps(op1, op2)

    if (op1P != null) { ops1P.push(op1P) }
    if (op2P != null) { ops2P.push(op2P) }

    [op1, op2] = [newOp1, newOp2]
  }

  return [O.simplify(ops1P), O.simplify(ops2P)]
}
export function composeNullable(ops1: ?Op[], ops2: ?Op[])
: ?Op[] {
  if (ops1 != null && ops2 != null) {
    return compose(ops1, ops2)
  } else if (ops1 != null) {
    return ops1
  } else if (ops2 != null) {
    return ops2
  } else {
    return undefined
  }
}
function _composeConsumeOps(a: ?Op, b: ?Op)
: [?Op, [?Op, ?Op]] {
  // returns [newOp, [a, b]]

  if (a != null && O.isRemove(a)) {
    return [a, [undefined, b]]
  }

  if (b != null && O.isInsert(b)) {
    return [b, [a, undefined]]
  }

  // neither op is null!
  if (a != null && b != null) {
    let minLength = Math.min(O.length(a), O.length(b))

    let [aHead, aTail] = O.split(a, minLength)
    let [bHead, bTail] = O.split(b, minLength)

    if (O.length(aHead) === 0) { aHead = undefined }
    if (O.length(aTail) === 0) { aTail = undefined }
    if (O.length(bHead) === 0) { bHead = undefined }
    if (O.length(bTail) === 0) { bTail = undefined }

    if (O.isRetain(a) && O.isRetain(b)) {
      return [aHead, [aTail, bTail]]
    }
    if (O.isInsert(a) && O.isRetain(b)) {
      return [aHead, [aTail, bTail]]
    }
    if (O.isRetain(a) && O.isRemove(b)) {
      return [bHead, [aTail, bTail]]
    }
    if (O.isInsert(a) && O.isRemove(b)) {
      return [undefined, [aTail, bTail]] // delete the inserted portion
    }
    if (O.isRemove(a) && O.isInsert(b)) {
      throw new Error('wat, should be handled already')
    }
    if (O.isRemove(a) && O.isRemove(b)) {
      throw new Error('wat, should be handled already')
    }
    if (O.isInsert(a) && O.isInsert(b)) {
      throw new Error('wat, should be handled already')
    }
    throw new Error('wat')
  }

  // one of the two ops is null!
  if (a != null) { return [a, [undefined, b]] }
  if (b != null) { return [b, [a, undefined]] }

  throw new Error('wat')
}
export function compose(ops1: Op[], ops2: Op[])
: Op[] {
  // compose (ops1, ops2) to composed s.t.
  // apply(apply(text, ops1), ops2) === apply(text, composed)

  // code borrowed from https://github.com/Operational-Transformation/ot.py/blob/master/ot/text_operation.py#L219

  let composed = []

  let i1 = 0
  let i2 = 0

  let op1: ?Op = undefined
  let op2: ?Op = undefined

  while (true) {
    if (op1 == null) { op1 = ops1[i1]; i1++ }
    if (op2 == null) { op2 = ops2[i2]; i2++ }

    if (op1 == null && op2 == null) { break }

    if ((op1 != null && O.length(op1) <= 0)) {
      op1 = null;
      continue
    }

    if ((op2 != null && O.length(op2) <= 0)) {
      op2 = null;
      continue
    }

    let [composedOp, [newOp1, newOp2]] = _composeConsumeOps(op1, op2)

    if (composedOp != null) { composed.push(composedOp) }
    [op1, op2] = [newOp1, newOp2]
  }

  return O.simplify(composed)
}

export function composeMany(ops: Iterable<Op[]>)
: Op[] {
  let composed: Op[] = []
  for (let op of ops) {
    composed = compose(composed, op)
  }
  return composed
}
