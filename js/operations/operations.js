/* @flow */

import * as U from '../helpers/utils.js'

export type Insert = string
export type Remove = number // always negative
export type Retain = number // always positive

export type Op = Insert | Remove | Retain

export function generateInsertion(pos: number, text: string): Op[] {
  return [ retainOp(pos), insertOp(text) ]
}

export function generateDeletion(pos: number, n: number): Op[] {
  return [ retainOp(pos), removeOp(n) ]
}

//


export function removeOp(num: number): Remove {
  return - Math.abs(num)
}

export function retainOp(o: number | string): Retain {
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

export function insertOp(text: string): Insert {
  return text
}

export function isRetain(op: Op): boolean {
  return typeof(op) === 'number' && op >= 0
}

export function isInsert(op: Op): boolean {
  return typeof(op) === 'string'
}

export function isRemove(op: Op): boolean {
  return typeof(op) === 'number' && op < 0
}

export function switchOnOp<R>(
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

export function split(op: Op, offset: number): [Op, Op] {
  return switchOnOp(op, {
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

export function length(op: Op): number {
  let l = switchOnOp(op, {
    insert: (insert: Insert) => insert.length,
    remove: (remove: Remove) => - remove,
    retain: (retain: Retain) => retain
  })
  if (l < 0) {
    throw new Error('wat op has negative length', op)
  }
  return l
}

export function joinInsert(insert0: Insert, op1: Op): ?Op {
  return switchOnOp(op1, {
    insert: (insert1: Insert) => insertOp(insert0 + insert1),
    remove: () => undefined,
    retain: () => undefined
  })
}

export function joinRetain(retain0: Retain, op1: Op): ?Op {
  return switchOnOp(op1, {
    insert: () => undefined,
    retain: (retain1: Retain) => retainOp(retain0 + retain1),
    remove: () => undefined
  })
}

export function joinRemove(remove0: Remove, op1: Op): ?Op {
  return switchOnOp(op1, {
    insert: () => undefined,
    retain: () => undefined,
    remove: (remove1: Remove) => removeOp(remove0 + remove1)
  })
}

export function join(op0: Op, op1: Op): ?Op {
  return switchOnOp(op0, {
    insert: insert => joinInsert(insert, op1),
    remove: remove => joinRemove(remove, op1),
    retain: retain => joinRetain(retain, op1)
  })
}


export function simplify(ops: Op[]): Op[] {
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
