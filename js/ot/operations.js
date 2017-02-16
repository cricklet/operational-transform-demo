/* @flow */

import * as U from './utils.js'
import { map } from 'wu'


type Insert = string
type Remove = number // always negative
type Retain = number // always positive

export type Op = Insert | Remove | Retain

export function generateInsertion(pos: number, text: string): Op[] {
  return [ retainOp(pos), insertOp(text) ]
}

export function generateDeletion(pos: number, n: number): Op[] {
  return [ retainOp(pos), removeOp(n) ]
}

//


function removeOp(num: number): Remove {
  return - Math.abs(num)
}

function retainOp(o: number | string): Retain {
  if (typeof(o) === 'string') {
    return o.length
  } else {
    let num: number = o
    if (num < 0) {
      throw new Error('wat retains should be positive')
    }
    return num
  }
}

function insertOp(text: string): Insert {
  return text
}

function isRetain(op: Op): boolean {
  return typeof(op) === 'number' && op >= 0
}

function isInsert(op: Op): boolean {
  return typeof(op) === 'string'
}

function isRemove(op: Op): boolean {
  return typeof(op) === 'number' && op < 0
}

function opSwitch<R>(
  op: Op,
  f: {
    insert: (i: Insert) => R,
    retain: (i: Retain) => R,
    remove: (i: Remove) => R,
  }
): R {
  if (typeof(op) === 'string') { // insert
    let insert: Insert = op
    return f.insert(insert)

  } else if (typeof(op) === 'number' && op < 0) { // remove
    let remove: Remove = op
    return f.remove(remove)

  } else if (typeof(op) === 'number' && op >= 0) { // retain
    let retain: Retain = op
    return f.retain(retain)
  }

  throw new Error('wat unknown op', op)
}

function split(op: Op, offset: number): [Op, Op] {
  return opSwitch(op, {
    insert: (insert: Insert) => {
      if (offset < 0 || offset > insert.length) {
        throw new Error()
      }
      return [
        insertOp(insert.substring(0, offset)),
        insertOp(insert.substring(offset))
      ]
    },
    remove: (remove: Remove) => {
      let num = length(remove)
      if (offset < 0 || offset > num) {
        throw new Error()
      }
      return [
        removeOp(offset),
        removeOp(num - offset)
      ]
    },
    retain: (retain: Retain) => {
      if (offset < 0 || offset > retain) {
        throw new Error()
      }
      return [
        retainOp(offset),
        retainOp(retain - offset)
      ]
    }
  })
}

function length(op: Op): number {
  let l = opSwitch(op, {
    insert: (insert: Insert) => insert.length,
    remove: (remove: Remove) => - remove,
    retain: (retain: Retain) => retain
  })
  if (l < 0) {
    throw new Error('wat op has negative length', op)
  }
  return l
}

function joinInsert(insert0: Insert, op1: Op): ?Op {
  return opSwitch(op1, {
    insert: (insert1: Insert) => insertOp(insert0 + insert1),
    remove: () => undefined,
    retain: () => undefined
  })
}

function joinRetain(retain0: Retain, op1: Op): ?Op {
  return opSwitch(op1, {
    insert: () => undefined,
    retain: (retain1: Retain) => retainOp(retain0 + retain1),
    remove: () => undefined
  })
}

function joinRemove(remove0: Remove, op1: Op): ?Op {
  return opSwitch(op1, {
    insert: () => undefined,
    retain: () => undefined,
    remove: (remove1: Remove) => removeOp(remove0 + remove1)
  })
}

function join(op0: Op, op1: Op): ?Op {
  return opSwitch(op0, {
    insert: insert => joinInsert(insert, op1),
    remove: remove => joinRemove(remove, op1),
    retain: retain => joinRetain(retain, op1)
  })
}

//

function simplify(ops: Op[]): Op[] {
  for (let i = 0; i < ops.length; i ++) {
    if (length(ops[i]) === 0) {
      U.removeInPlace(ops, i)
      i --
    }
  }

  for (let i = 1; i < ops.length; i ++) {
    let newOp = join(ops[i - 1], ops[i])
    if (newOp != null) {
      ops[i - 1] = newOp
      U.removeInPlace(ops, i) // remove extra op
      i --
    }
  }

  if (ops.length > 0 && isRetain(U.last(ops))) {
    ops.pop() // remove trailing retain
  }

  return ops
}

export let Transformer = {
  _transformConsumeOps: function(a: ?Op, b: ?Op)
  : [[?Op, ?Op], [?Op, ?Op]] {
    // returns [[aP, bP], [a, b]]

    if (a != null && isInsert(a)) {
      return [
        [a, retainOp(a)],
        [undefined, b]
      ]
    }

    if (b != null && isInsert(b)) {
      return [
        [retainOp(b), b],
        [a, undefined]
      ]
    }

    // neither is null
    if (a != null && b != null) {
      let minLength = Math.min(length(a), length(b))

      let [aHead, aTail] = split(a, minLength)
      let [bHead, bTail] = split(b, minLength)

      if (length(aHead) === 0) { aHead = undefined }
      if (length(aTail) === 0) { aTail = undefined }
      if (length(bHead) === 0) { bHead = undefined }
      if (length(bTail) === 0) { bTail = undefined }

      if (isRetain(a) && isRetain(b)) {
        return [[aHead, bHead], [aTail, bTail]]
      }
      if (isRemove(a) && isRetain(b)) {
        return [[aHead, undefined], [aTail, bTail]]
      }
      if (isRetain(a) && isRemove(b)) {
        return [[undefined, bHead], [aTail, bTail]]
      }
      if (isRemove(a) || isRemove(b)) {
        return [[undefined, undefined], [aTail, bTail]] // both do the same thing
      }
      if (isInsert(a) || isInsert(b)) {
        throw new Error('wat, should be handled already')
      }
      throw new Error('wat')
    }

    // one is null
    if (a != null) { return [[a, undefined], [undefined, b]] }
    if (b != null) { return [[undefined, b], [a, undefined]] }

    throw new Error('wat')
  },
  transformNullable: function(clientOps: ?Op[], serverOps: ?Op[])
  : [?Op[], ?Op[]] {
    if (clientOps != null && serverOps != null) {
      let [newClientOps, newServerOps] = this.transform(clientOps, serverOps)
      return [newClientOps, newServerOps]
    } else {
      return [clientOps, serverOps]
    }
  },
  transform: function(clientOps: Op[], serverOps: Op[])
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

      if ((op1 != null && length(op1) <= 0)) {
        op1 = null;
        continue
      }

      if ((op2 != null && length(op2) <= 0)) {
        op2 = null;
        continue
      }

      let [[op1P, op2P], [newOp1, newOp2]] = this._transformConsumeOps(op1, op2)

      if (op1P != null) { ops1P.push(op1P) }
      if (op2P != null) { ops2P.push(op2P) }

      [op1, op2] = [newOp1, newOp2]
    }

    return [simplify(ops1P), simplify(ops2P)]
  },
  composeNullable: function(ops1: ?Op[], ops2: ?Op[])
  : ?Op[] {
    if (ops1 != null && ops2 != null) {
      return this.compose(ops1, ops2)
    } else if (ops1 != null) {
      return ops1
    } else if (ops2 != null) {
      return ops2
    } else {
      return undefined
    }
  },
  _composeConsumeOps: function(a: ?Op, b: ?Op)
  : [?Op, [?Op, ?Op]] {
    // returns [newOp, [a, b]]

    if (a != null && isRemove(a)) {
      return [a, [undefined, b]]
    }

    if (b != null && isInsert(b)) {
      return [b, [a, undefined]]
    }

    // neither op is null!
    if (a != null && b != null) {
      let minLength = Math.min(length(a), length(b))

      let [aHead, aTail] = split(a, minLength)
      let [bHead, bTail] = split(b, minLength)

      if (length(aHead) === 0) { aHead = undefined }
      if (length(aTail) === 0) { aTail = undefined }
      if (length(bHead) === 0) { bHead = undefined }
      if (length(bTail) === 0) { bTail = undefined }

      if (isRetain(a) && isRetain(b)) {
        return [aHead, [aTail, bTail]]
      }
      if (isInsert(a) && isRetain(b)) {
        return [aHead, [aTail, bTail]]
      }
      if (isRetain(a) && isRemove(b)) {
        return [bHead, [aTail, bTail]]
      }
      if (isInsert(a) && isRemove(b)) {
        return [undefined, [aTail, bTail]] // delete the inserted portion
      }
      if (isRemove(a) && isInsert(b)) {
        throw new Error('wat, should be handled already')
      }
      if (isRemove(a) && isRemove(b)) {
        throw new Error('wat, should be handled already')
      }
      if (isInsert(a) && isInsert(b)) {
        throw new Error('wat, should be handled already')
      }
      throw new Error('wat')
    }

    // one of the two ops is null!
    if (a != null) { return [a, [undefined, b]] }
    if (b != null) { return [b, [a, undefined]] }

    throw new Error('wat')
  },
  compose: function(ops1: Op[], ops2: Op[])
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

      if ((op1 != null && length(op1) <= 0)) {
        op1 = null;
        continue
      }

      if ((op2 != null && length(op2) <= 0)) {
        op2 = null;
        continue
      }

      let [composedOp, [newOp1, newOp2]] = this._composeConsumeOps(op1, op2)

      if (composedOp != null) { composed.push(composedOp) }
      [op1, op2] = [newOp1, newOp2]
    }

    return simplify(composed)
  },
  composeMany: function(ops: Iterable<Op[]>)
  : Op[] {
    let composed: Op[] = []
    for (let op of ops) {
      composed = this.compose(composed, op)
    }
    return composed
  }
}

//

export let TextApplier = {
  initial: function (): string {
    return ''
  },
  stateHash: function(text: string): string {
    return text
  },
  apply: function(text: string, ops: Op[])
  : [string, Op[]] { // returns [state, undo]
    let i = 0
    let undo = []
    for (let op of ops) {
      opSwitch(op, {
        insert: (insert: Insert) => {
          undo.push(- insert.length)
          text = text.slice(0, i) + insert + text.slice(i)
          i += length(insert)
        },
        remove: (remove: Remove) => {
          let num = length(remove)
          if (i + num > text.length) { throw new Error('wat, trying to delete too much') }
          undo.push(text.slice(i, i + num))
          text = text.slice(0, i) + text.slice(i + num)
        },
        retain: (retain: Retain) => {
          undo.push(retain)
          i += length(retain)
        }
      })

      // make sure we didn't accidentally overshoot
      if (i > text.length) { throw new Error('wat, overshot') }
    }

    return [text, simplify(undo)]
  }
}

export let inferOps = function(oldText: string, newText: string)
: ?Op[] {
  if (oldText.length === newText.length) {
    // we have a no-op
    if (oldText === newText) {
      return undefined;
    }
  }

  if (newText.length === 0) {
    return [ - oldText.length ]
  }

  if (oldText.length === 0) {
    return [ newText ]
  }

  // or we have a selection being overwritten.
  let postfixLength = U.calculatePostfixLength(oldText, newText)
  let newTextLeftover = U.removeTail(newText, postfixLength)
  let oldTextLeftover = U.removeTail(oldText, postfixLength)
  let prefixLength = U.calculatePrefixLength(oldTextLeftover, newTextLeftover)

  let start = prefixLength
  let endOld = oldText.length - postfixLength
  let endNew = newText.length - postfixLength

  return [ // update
    start,
    - (endOld - start),
    U.string(U.substring(newText, {start: start, stop: endNew}))
  ]
}

//

export type CursorState = {start: number, end: number}
export let CursorApplier = {
  initial: function(): CursorState {
    return {start: 0, end: 0}
  },
  stateHash: function(state: CursorState): string {
    throw new Error('not implemented')
  },
  _adjustPosition: function(pos: number, ops: Op[]): number {
    let i = 0
    for (let op of ops) {
      if (i >= pos) { break }

      opSwitch(op, {
        insert: (insert: Insert) => {
          i += length(insert)
          pos += length(insert)
        },
        remove: (remove: Remove) => {
          pos -= length(remove)
        },
        retain: (retain: Retain) => {
          i += length(retain)
        }
      })
    }
    return pos
  },
  apply: function(state: CursorState, ops: Op[]): CursorState {
    return {
      start: this._adjustPosition(state.start, ops),
      end: this._adjustPosition(state.end, ops)
    }
  }
}

//

export type DocumentState = {cursor: CursorState, text: string}
export let DocumentApplier = {
  initial: function(): DocumentState {
    return { cursor: CursorApplier.initial(), text: TextApplier.initial() }
  },
  stateHash: function(state: DocumentState): string {
    return TextApplier.stateHash(state.text)
  },
  apply: function(state: DocumentState, ops: Op[]): [DocumentState, Op[]] {
    let [text, undo] = TextApplier.apply(state.text, ops)
    let cursor = CursorApplier.apply(state.cursor, ops)
    return [
      { cursor: cursor, text: text },
      undo
    ]
  }
}
