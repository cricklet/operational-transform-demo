/* @flow */

import * as Components from './components.js'
import type { Insert, Remove, Retain, OpComponent } from './Components.js'

import * as U from '../helpers/utils.js'

function _transformConsumeOps(a: ?OpComponent, b: ?OpComponent)
: [[?OpComponent, ?OpComponent], [?OpComponent, ?OpComponent]] {
  // returns [[aP, bP], [a, b]]

  if (a != null && Components.isInsert(a)) {
    return [
      [a, Components.createRetain(a)],
      [undefined, b]
    ]
  }

  if (b != null && Components.isInsert(b)) {
    return [
      [Components.createRetain(b), b],
      [a, undefined]
    ]
  }

  // neither is null
  if (a != null && b != null) {
    let minLength = Math.min(Components.length(a), Components.length(b))

    let [aHead, aTail] = Components.split(a, minLength)
    let [bHead, bTail] = Components.split(b, minLength)

    if (Components.length(aHead) === 0) { aHead = undefined }
    if (Components.length(aTail) === 0) { aTail = undefined }
    if (Components.length(bHead) === 0) { bHead = undefined }
    if (Components.length(bTail) === 0) { bTail = undefined }

    if (Components.isRetain(a) && Components.isRetain(b)) {
      return [[aHead, bHead], [aTail, bTail]]
    }
    if (Components.isRemove(a) && Components.isRetain(b)) {
      return [[aHead, undefined], [aTail, bTail]]
    }
    if (Components.isRetain(a) && Components.isRemove(b)) {
      return [[undefined, bHead], [aTail, bTail]]
    }
    if (Components.isRemove(a) || Components.isRemove(b)) {
      return [[undefined, undefined], [aTail, bTail]] // both do the same thing
    }
    if (Components.isInsert(a) || Components.isInsert(b)) {
      throw new Error('wat, should be handled already')
    }
    throw new Error('wat')
  }

  // one is null
  if (a != null) { return [[a, undefined], [undefined, b]] }
  if (b != null) { return [[undefined, b], [a, undefined]] }

  throw new Error('wat')
}

export function transformNullable(clientOp: ?OpComponent[], serverOp: ?OpComponent[])
: [?OpComponent[], ?OpComponent[]] {
  if (clientOp != null && serverOp != null) {
    let [newClientOps, newServerOps] = transform(clientOp, serverOp)
    return [newClientOps, newServerOps]
  } else {
    return [clientOp, serverOp]
  }
}

export function transform(clientOp: OpComponent[], serverOp: OpComponent[])
: [OpComponent[], OpComponent[]] {
  let op1 = clientOp
  let op2 = serverOp

  let op1P = []
  let op2P = []

  let i1 = 0
  let i2 = 0

  let c1: ?OpComponent = undefined
  let c2: ?OpComponent = undefined

  while (true) {
    if (c1 == null) { c1 = op1[i1]; i1++ }
    if (c2 == null) { c2 = op2[i2]; i2++ }

    if (c1 == null && c2 == null) { break }

    if ((c1 != null && Components.length(c1) <= 0)) {
      c1 = null;
      continue
    }

    if ((c2 != null && Components.length(c2) <= 0)) {
      c2 = null;
      continue
    }

    let [[c1P, c2P], [newC1, newC2]] = _transformConsumeOps(c1, c2)

    if (c1P != null) { op1P.push(c1P) }
    if (c2P != null) { op2P.push(c2P) }

    [c1, c2] = [newC1, newC2]
  }

  return [Components.simplify(op1P), Components.simplify(op2P)]
}
export function composeNullable(op1: ?OpComponent[], op2: ?OpComponent[])
: ?OpComponent[] {
  if (op1 != null && op2 != null) {
    return compose(op1, op2)
  } else if (op1 != null) {
    return op1
  } else if (op2 != null) {
    return op2
  } else {
    return undefined
  }
}
function _composeConsumeOps(a: ?OpComponent, b: ?OpComponent)
: [?OpComponent, [?OpComponent, ?OpComponent]] {
  // returns [newOp, [a, b]]

  if (a != null && Components.isRemove(a)) {
    return [a, [undefined, b]]
  }

  if (b != null && Components.isInsert(b)) {
    return [b, [a, undefined]]
  }

  // neither op is null!
  if (a != null && b != null) {
    let minLength = Math.min(Components.length(a), Components.length(b))

    let [aHead, aTail] = Components.split(a, minLength)
    let [bHead, bTail] = Components.split(b, minLength)

    if (Components.length(aHead) === 0) { aHead = undefined }
    if (Components.length(aTail) === 0) { aTail = undefined }
    if (Components.length(bHead) === 0) { bHead = undefined }
    if (Components.length(bTail) === 0) { bTail = undefined }

    if (Components.isRetain(a) && Components.isRetain(b)) {
      return [aHead, [aTail, bTail]]
    }
    if (Components.isInsert(a) && Components.isRetain(b)) {
      return [aHead, [aTail, bTail]]
    }
    if (Components.isRetain(a) && Components.isRemove(b)) {
      return [bHead, [aTail, bTail]]
    }
    if (Components.isInsert(a) && Components.isRemove(b)) {
      return [undefined, [aTail, bTail]] // delete the inserted portion
    }
    if (Components.isRemove(a) && Components.isInsert(b)) {
      throw new Error('wat, should be handled already')
    }
    if (Components.isRemove(a) && Components.isRemove(b)) {
      throw new Error('wat, should be handled already')
    }
    if (Components.isInsert(a) && Components.isInsert(b)) {
      throw new Error('wat, should be handled already')
    }
    throw new Error('wat')
  }

  // one of the two operations is null!
  if (a != null) { return [a, [undefined, b]] }
  if (b != null) { return [b, [a, undefined]] }

  throw new Error('wat')
}
export function compose(op1: OpComponent[], op2: OpComponent[])
: OpComponent[] {
  // compose (op1, op2) to composed s.t.
  // apply(apply(text, op1), op2) === apply(text, composed)

  // code borrowed from https://github.com/Operational-Transformation/ot.py/blob/master/ot/text_operation.py#L219

  let composed = []

  let i1 = 0
  let i2 = 0

  let c1: ?OpComponent = undefined
  let c2: ?OpComponent = undefined

  while (true) {
    if (c1 == null) { c1 = op1[i1]; i1++ }
    if (c2 == null) { c2 = op2[i2]; i2++ }

    if (c1 == null && c2 == null) { break }

    if ((c1 != null && Components.length(c1) <= 0)) {
      c1 = null;
      continue
    }

    if ((c2 != null && Components.length(c2) <= 0)) {
      c2 = null;
      continue
    }

    let [composedOp, [newC1, newC2]] = _composeConsumeOps(c1, c2)

    if (composedOp != null) { composed.push(composedOp) }
    [c1, c2] = [newC1, newC2]
  }

  return Components.simplify(composed)
}

export function composeMany(operations: Iterable<OpComponent[]>)
: OpComponent[] {
  let composed: OpComponent[] = []
  for (let operation of operations) {
    composed = compose(composed, operation)
  }
  return composed
}
