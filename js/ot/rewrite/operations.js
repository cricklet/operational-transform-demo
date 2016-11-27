/* @flow */

import { hash, clone, assign, genUid, rearray, repeat, calculatePostfixLength, removeTail, calculatePrefixLength, substring, restring } from '../utils.js'
import { map } from 'wu'

export type Delete = {
  kind: 'Delete',
  num: number
}

export type Insert = {
  kind: 'Insert',
  text: string
}

export type Retain = {
  kind: 'Retain',
  num: number
}

export type TextOperation = {
  kind: 'TextOperation',
  ops: Array<Retain|Delete|Insert>,
}

function retain(num): Retain {
  return { kind: 'Retain', num: num }
}

function del(num): Delete {
  return { kind: 'Delete', num: num }
}

function insert(text): Insert {
  return { kind: 'Insert', text: text }
}

export function opString(o: ?(Retain|Insert|Delete)): string {
  if (o == null) { return 'undefined' }
  if (o.kind === 'Retain') { return 'retain:' + o.num }
  if (o.kind === 'Delete') { return 'delete:' + o.num }
  if (o.kind === 'Insert') { return 'insert:"' + o.text + '"' }
  throw new Error('wat, couldn\'t make op string')
}

export function opsString(ops: TextOperation): string {
  return "[" + Array.from(map(opString, ops.ops)).join(', ') + "]"
}

export function generateEmpty(): TextOperation {
  return {
    kind: 'TextOperation',
    ops: []
  }
}

export function generateDelete(position: number, num: number): TextOperation {
  return {
    kind: 'TextOperation',
    ops: [retain(position), del(num)]
  }
}

export function generateInsert(position: number, text: string): TextOperation {
  return {
    kind: 'TextOperation',
    ops: [retain(position), insert(text)]
  }
}

export function isEmpty(op: TextOperation): boolean {
  return op.ops.length === 0
}

function adjustment (operation: Retain|Delete|Insert): number {
  if (operation.kind === 'Retain') {
    return operation.num
  }
  if (operation.kind === 'Delete') {
    return - operation.num
  }
  if (operation.kind === 'Insert') {
    return operation.text.length
  }
  throw new Error('wat, failed adjumstment')
}

function length (operation: Retain|Delete|Insert): number {
  let result: number = (() => {
    if (operation.kind === 'Retain' || operation.kind === 'Delete') {
      return operation.num
    }
    if (operation.kind === 'Insert') {
      return operation.text.length
    }
    throw new Error('wat, failed length')
  }) ()

  if (result < 0) {
    throw new Error('wat, < 0 for length')
  }

  return result
}

function head (operation: Retain|Delete|Insert, offset: number): ?(Retain|Delete|Insert) {
  let newOp: ?(Retain|Delete|Insert)

  if (operation.kind === 'Retain' || operation.kind === 'Delete') {
    newOp = assign(clone(operation), { num: offset })
  } else if (operation.kind === 'Insert') {
    newOp = assign(clone(operation), { text: operation.text.substring(0, offset) })
  }

  if (newOp == undefined || length(newOp) === 0) {
    return undefined
  }

  return newOp
}

function tail (operation: Retain|Delete|Insert, offset: number): ?(Retain|Delete|Insert) {
  let newOp: ?(Retain|Delete|Insert)

  if (operation.kind === 'Retain' || operation.kind === 'Delete') {
    newOp = assign(clone(operation), { num: operation.num - offset })
  } else if (operation.kind === 'Insert') {
    newOp = assign(clone(operation), { text: operation.text.substring(offset) })
  }

  if (newOp == undefined || length(newOp) === 0) {
    return undefined
  }

  return newOp
}

export function apply(text: string, textOperations: TextOperation): string {
  let i = 0
  for (let op of textOperations.ops) {
    if (op.kind === 'Insert') {
      text = text.slice(0, i) + op.text + text.slice(i)
      i += op.text.length
    }
    if (op.kind === 'Retain') {
      if (op.num < 0) { throw new Error('wat, failed to retain') }
      i += op.num
    }
    if (op.kind === 'Delete') {
      if (op.num < 0) { throw new Error('wat, failed to delete') }
      if (i + op.num > text.length) { throw new Error('wat, trying to delete too much') }
      text = text.slice(0, i) + text.slice(i + op.num)
    }

    // make sure we didn't accidentally overshoot
    if (i > text.length) { throw new Error('wat, overshot') }
  }

  return text
}

export function transformConsumeOps(a: ?(Insert|Delete|Retain), b: ?(Insert|Delete|Retain))
: [[?(Insert|Delete|Retain), ?(Insert|Delete|Retain)], [?(Insert|Delete|Retain), ?(Insert|Delete|Retain)]] {
  // returns [[aP, bP], [a, b]]
  if (a != null && a.kind === 'Insert') {
    return [[a, retain(length(a))], [undefined, b]]
  }

  if (b != null && b.kind === 'Insert') {
    return [[retain(length(b)), b], [a, undefined]]
  }

  // neither is null
  if (a != null && b != null) {
    let minLength = Math.min(length(a), length(b))

    let aHead = head(a, minLength)
    let bHead = head(b, minLength)

    let aTail = tail(a, minLength)
    let bTail = tail(b, minLength)

    if (a.kind === 'Retain' && b.kind === 'Retain') {
      return [[aHead, bHead], [aTail, bTail]]
    }
    if (a.kind === 'Delete' && b.kind === 'Retain') {
      return [[aHead, undefined], [aTail, bTail]]
    }
    if (a.kind === 'Retain' && b.kind === 'Delete') {
      return [[undefined, bHead], [aTail, bTail]]
    }
    if (a.kind === 'Delete' || b.kind === 'Delete') {
      return [[undefined, undefined], [aTail, bTail]] // both do the same thing
    }
    if (a.kind === 'Insert' || b.kind === 'Insert') {
      throw new Error('wat, should be handled already')
    }
    throw new Error('wat')
  }

  // one is null
  if (a != null) { return [[a, undefined], [undefined, b]] }
  if (b != null) { return [[undefined, b], [a, undefined]] }

  throw new Error('wat')
}

export function transformNullable (clientOps: ?TextOperation, serverOps: ?TextOperation)
: [?TextOperation, ?TextOperation] {
  if (clientOps != null && serverOps != null) {
    let [newClientOps, newServerOps] = transform(clientOps, serverOps)
    return [newClientOps, newServerOps]
  } else {
    return [clientOps, serverOps]
  }
}

export function transform(clientOps: TextOperation, serverOps: TextOperation): [TextOperation, TextOperation] {
  // transform (clientOp, serverOp) to (clientOpP, serverOpP) s.t.
  // apply(apply(text, clientOp), serverOpP) === apply(apply(text, serverOp, clientOpP))

  // code borrowed from https://github.com/Operational-Transformation/ot.py/blob/master/ot/text_operation.py#L219

  let ops1 = clientOps
  let ops2 = serverOps

  let ops1P = generateEmpty()
  let ops2P = generateEmpty()

  let i1 = 0
  let i2 = 0

  let op1: ?(Insert|Delete|Retain) = undefined
  let op2: ?(Insert|Delete|Retain) = undefined

  while (true) {
    if (op1 == null) { op1 = ops1.ops[i1]; i1++ }
    if (op2 == null) { op2 = ops2.ops[i2]; i2++ }

    if (op1 == null && op2 == null) { break }

    if ((op1 != null && length(op1) <= 0)) {
      op1 = null;
      continue
    }

    if ((op2 != null && length(op2) <= 0)) {
      op2 = null;
      continue
    }

    let [[op1P, op2P], [newOp1, newOp2]] = transformConsumeOps(op1, op2)

    if (op1P != null) { ops1P.ops.push(op1P) }
    if (op2P != null) { ops2P.ops.push(op2P) }

    [op1, op2] = [newOp1, newOp2]
  }

  return [ops1P, ops2P]
}

export function composeConsumeOps(a: ?(Insert|Delete|Retain), b: ?(Insert|Delete|Retain))
: [?(Insert|Delete|Retain), [?(Insert|Delete|Retain), ?(Insert|Delete|Retain)]] {
  // returns [newOp, [a, b]]

  if (a != null && a.kind === 'Delete') {
    return [clone(a), [undefined, b]]
  }

  if (b != null && b.kind === 'Insert') {
    return [clone(b), [a, undefined]]
  }

  // neither op is null!
  if (a != null && b != null) {
    let minLength = Math.min(length(a), length(b))

    let aHead = head(a, minLength)
    let bHead = head(b, minLength)

    let aTail = tail(a, minLength)
    let bTail = tail(b, minLength)

    if (a.kind === 'Retain' && b.kind === 'Retain') {
      return [aHead, [aTail, bTail]]
    }
    if (a.kind === 'Insert' && b.kind === 'Retain') {
      return [aHead, [aTail, bTail]]
    }
    if (a.kind === 'Retain' && b.kind === 'Delete') {
      return [bHead, [aTail, bTail]]
    }
    if (a.kind === 'Insert' && b.kind === 'Delete') {
      return [undefined, [aTail, bTail]] // delete the inserted portion
    }
    if (a.kind === 'Delete' && b.kind === 'Insert') {
      throw new Error('wat, should be handled already')
    }
    if (a.kind === 'Delete' && b.kind === 'Delete') {
      throw new Error('wat, should be handled already')
    }
    if (a.kind === 'Insert' && b.kind === 'Insert') {
      throw new Error('wat, should be handled already')
    }
    throw new Error('wat')
  }

  // one of the two ops is null!
  if (a != null) { return [clone(a), [undefined, b]] }
  if (b != null) { return [clone(b), [a, undefined]] }

  throw new Error('wat')
}

export function composeNullable (ops1: ?TextOperation, ops2: ?TextOperation)
: ?TextOperation {
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
export function compose(ops1: TextOperation, ops2: TextOperation): TextOperation {
  // compose (ops1, ops2) to composed s.t.
  // apply(apply(text, ops1), ops2) === apply(text, composed)

  // code borrowed from https://github.com/Operational-Transformation/ot.py/blob/master/ot/text_operation.py#L219

  let composed = generateEmpty()

  let i1 = 0
  let i2 = 0

  let op1: ?(Insert|Delete|Retain) = undefined
  let op2: ?(Insert|Delete|Retain) = undefined

  while (true) {
    if (op1 == null) { op1 = ops1.ops[i1]; i1++ }
    if (op2 == null) { op2 = ops2.ops[i2]; i2++ }

    if (op1 == null && op2 == null) { break }

    if ((op1 != null && length(op1) <= 0)) {
      op1 = null;
      continue
    }

    if ((op2 != null && length(op2) <= 0)) {
      op2 = null;
      continue
    }

    let [composedOp, [newOp1, newOp2]] = composeConsumeOps(op1, op2)

    if (composedOp != null) { composed.ops.push(composedOp) }
    [op1, op2] = [newOp1, newOp2]
  }

  return composed
}

export function composeMany(ops: Iterable<TextOperation>): TextOperation {
  let composed = generateEmpty()
  for (let op: TextOperation of ops) {
    composed = compose(composed, op)
  }
  return composed
}

export function inferOperations(oldText: string, newText: string): ?TextOperation {
  if (oldText.length === newText.length) {
    // we have a no-op
    if (oldText === newText) {
      return undefined;
    }
  }

  if (newText.length === 0) {
    return generateDelete(0, oldText.length)
  }

  if (oldText.length === 0) {
    return generateInsert(0, newText)
  }

  // or we have a selection being overwritten. this is well tested!
  let postfixLength = calculatePostfixLength(oldText, newText)
  let newTextLeftover = removeTail(newText, postfixLength)
  let oldTextLeftover = removeTail(oldText, postfixLength)
  let prefixLength = calculatePrefixLength(oldTextLeftover, newTextLeftover)

  let start = prefixLength
  let endOld = oldText.length - postfixLength
  let endNew = newText.length - postfixLength

  let del = generateDelete(start, endOld - start)
  let insert = generateInsert(start,
    restring(substring(newText, {start: start, stop: endNew})))

  return compose(del, insert)
}
