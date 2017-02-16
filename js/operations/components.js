/* @flow */

import * as U from '../helpers/utils.js'

import type { Insert, Remove, Retain, OpComponent, Operation } from './types.js'

export function generateInsertion(pos: number, text: string): OpComponent[] {
  return [ createRetain(pos), createInsert(text) ]
}

export function generateDeletion(pos: number, n: number): OpComponent[] {
  return [ createRetain(pos), createRemove(n) ]
}

//


export function createRemove(num: number): Remove {
  return - Math.abs(num)
}

export function createRetain(o: number | string): Retain {
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

export function createInsert(text: string): Insert {
  return text
}

export function isRetain(c: OpComponent): boolean {
  return typeof(c) === 'number' && c >= 0
}

export function isInsert(c: OpComponent): boolean {
  return typeof(c) === 'string'
}

export function isRemove(c: OpComponent): boolean {
  return typeof(c) === 'number' && c < 0
}

export function handleComponent<R>(
  c: OpComponent,
  f: {
    insert: (i: Insert) => R,
    retain: (i: Retain) => R,
    remove: (i: Remove) => R,
  }
): R {
  if (typeof(c) === 'string') { // insert
    let insert: Insert = c
    return f.insert(insert)

  } else if (typeof(c) === 'number' && c < 0) { // remove
    let remove: Remove = c
    return f.remove(remove)

  } else if (typeof(c) === 'number' && c >= 0) { // retain
    let retain: Retain = c
    return f.retain(retain)
  }

  throw new Error('wat unknown c', c)
}

export function split(c: OpComponent, offset: number): [OpComponent, OpComponent] {
  return handleComponent(c, {
    insert: (insert: Insert) => {
      if (offset < 0 || offset > insert.length) {
        throw new Error()
      }
      return [
        createInsert(insert.substring(0, offset)),
        createInsert(insert.substring(offset))
      ]
    },
    remove: (remove: Remove) => {
      let num = length(remove)
      if (offset < 0 || offset > num) {
        throw new Error()
      }
      return [
        createRemove(offset),
        createRemove(num - offset)
      ]
    },
    retain: (retain: Retain) => {
      if (offset < 0 || offset > retain) {
        throw new Error()
      }
      return [
        createRetain(offset),
        createRetain(retain - offset)
      ]
    }
  })
}

export function length(c: OpComponent): number {
  let l = handleComponent(c, {
    insert: (insert: Insert) => insert.length,
    remove: (remove: Remove) => - remove,
    retain: (retain: Retain) => retain
  })
  if (l < 0) {
    throw new Error('wat c has negative length', c)
  }
  return l
}

export function joinInsert(insert0: Insert, c1: OpComponent): ?OpComponent {
  return handleComponent(c1, {
    insert: (insert1: Insert) => createInsert(insert0 + insert1),
    remove: () => undefined,
    retain: () => undefined
  })
}

export function joinRetain(retain0: Retain, c1: OpComponent): ?OpComponent {
  return handleComponent(c1, {
    insert: () => undefined,
    retain: (retain1: Retain) => createRetain(retain0 + retain1),
    remove: () => undefined
  })
}

export function joinRemove(remove0: Remove, c1: OpComponent): ?OpComponent {
  return handleComponent(c1, {
    insert: () => undefined,
    retain: () => undefined,
    remove: (remove1: Remove) => createRemove(remove0 + remove1)
  })
}

export function join(c0: OpComponent, c1: OpComponent): ?OpComponent {
  return handleComponent(c0, {
    insert: insert => joinInsert(insert, c1),
    remove: remove => joinRemove(remove, c1),
    retain: retain => joinRetain(retain, c1)
  })
}


export function simplify(operation: OpComponent[]): OpComponent[] {
  for (let i = 0; i < operation.length; i ++) {
    if (length(operation[i]) === 0) {
      U.removeInPlace(operation, i)
      i --
    }
  }

  for (let i = 1; i < operation.length; i ++) {
    let c = join(operation[i - 1], operation[i])
    if (c != null) {
      operation[i - 1] = c
      U.removeInPlace(operation, i) // remove extra c
      i --
    }
  }

  if (operation.length > 0 && isRetain(U.last(operation))) {
    operation.pop() // remove trailing retain
  }

  return operation
}
