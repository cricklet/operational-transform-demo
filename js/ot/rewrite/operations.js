/* @flow */

import { hash, clone, assign, genUid } from '../utils.js'
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
  uid: string
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
  throw 'wat'
}

export function opsString(ops: TextOperation): string {
  return "[" + Array.from(map(opString, ops.ops)).join(', ') + "]"
}

export function generateEmpty(): TextOperation {
  return {
    kind: 'TextOperation',
    uid: genUid(),
    ops: []
  }
}

export function generateDelete(position: number, num: number): TextOperation {
  return {
    kind: 'TextOperation',
    uid: genUid(),
    ops: [retain(position), del(num)]
  }
}

export function generateInsert(position: number, text: string): TextOperation {
  return {
    kind: 'TextOperation',
    uid: genUid(),
    ops: [retain(position), insert(text)]
  }
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
  throw 'wat'
}

function length (operation: Retain|Delete|Insert): number {
  let result: number = (() => {
    if (operation.kind === 'Retain' || operation.kind === 'Delete') {
      return operation.num
    }
    if (operation.kind === 'Insert') {
      return operation.text.length
    }
    throw 'wat'
  }) ()

  if (result < 0) {
    throw 'wat'
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
      if (op.num < 0) { throw 'wat' }
      i += op.num
    }
    if (op.kind === 'Delete') {
      if (op.num < 0) { throw 'wat' }
      if (i + op.num > text.length) { throw 'wat' }
      text = text.slice(0, i) + text.slice(i + op.num)
    }

    // make sure we didn't accidentally overshoot
    if (i > text.length) { throw 'wat' }
  }

  return text
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
    if (op1 === undefined) { op1 = ops1.ops[i1]; i1++ }
    if (op2 === undefined) { op2 = ops2.ops[i2]; i2++ }

    if (op1 == null && op2 == null) { break }

    if ((op1 != null && length(op1) <= 0) ||
        (op2 != null && length(op2) <= 0)) {
      throw 'lengths are zero...'
    }

    if (op1 != null && op1.kind === 'Insert') {
      ops1P.ops.push(op1)
      ops2P.ops.push(retain(length(op1)))
      op1 = undefined
      continue
    }

    if (op2 != null && op2.kind === 'Insert') {
      ops1P.ops.push(retain(length(op2)))
      ops2P.ops.push(op2)
      op2 = undefined
      continue
    }

    if (op1 != null && op2 != null) {
      let minLength = Math.min(length(op1), length(op2))

      if (op1.kind === 'Retain' && op2.kind === 'Retain') {
        ops1P.ops.push(retain(minLength))
        ops2P.ops.push(retain(minLength))
      }

      if (op1.kind === 'Delete' && op2.kind === 'Retain') {
        ops1P.ops.push(del(minLength))
      }

      if (op1.kind === 'Retain' && op2.kind === 'Delete') {
        ops2P.ops.push(del(minLength))
      }

      op1 = tail(op1, minLength)
      op2 = tail(op2, minLength)

      continue
    }

    if (op1 != null && op1.kind === 'Delete') {
      ops1P.ops.push(del(op1.num))
      op1 = undefined
      continue
    }

    if (op2 != null && op2.kind === 'Delete') {
      ops2P.ops.push(del(op2.num))
      op2 = undefined
      continue
    }

    if (op1 != null && op1.kind === 'Retain') {
      op1 = undefined
      continue
    }

    if (op2 != null && op2.kind === 'Retain') {
      op2 = undefined
      continue
    }
  }

  return [ops1P, ops2P]
}

export function consumeOperations(a: ?(Insert|Delete|Retain), b: ?(Insert|Delete|Retain))
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

    let head1 = head(a, minLength)
    let head2 = head(b, minLength)

    let tail1 = tail(a, minLength)
    let tail2 = tail(b, minLength)

    if (a.kind === 'Retain' && b.kind === 'Retain') {
      return [head1, [tail1, tail2]]
    }
    if (a.kind === 'Insert' && b.kind === 'Retain') {
      return [head1, [tail1, tail2]]
    }
    if (a.kind === 'Retain' && b.kind === 'Delete') {
      return [head2, [tail1, tail2]]
    }
    if (a.kind === 'Insert' && b.kind === 'Delete') {
      return [undefined, [tail1, tail2]] // delete the inserted portion
    }
    if (a.kind === 'Delete' && b.kind === 'Insert') {
      throw 'wat, should be handled already'
    }
    if (a.kind === 'Delete' && b.kind === 'Delete') {
      throw 'wat, should be handled already'
    }
    if (a.kind === 'Insert' && b.kind === 'Insert') {
      throw 'wat, should be handled already'
    }
    throw 'wat'
  }

  // one of the two ops is null!
  if (a != null) { return [clone(a), [undefined, b]] }
  if (b != null) { return [clone(b), [a, undefined]] }

  throw 'wat'
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
    if (op1 === undefined) { op1 = ops1.ops[i1]; i1++ }
    if (op2 === undefined) { op2 = ops2.ops[i2]; i2++ }

    if (op1 == null && op2 == null) { break }

    if ((op1 != null && length(op1) <= 0) ||
        (op2 != null && length(op2) <= 0)) {
      throw 'lengths are zero...'
    }

    let [composedOp, [newOp1, newOp2]] = consumeOperations(op1, op2)

    if (composedOp != null) { composed.ops.push(composedOp) }
    [op1, op2] = [newOp1, newOp2]
  }

  return composed
}
