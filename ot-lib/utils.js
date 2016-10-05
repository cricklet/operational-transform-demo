/* @flow */

export let Greater = 1
export let Equal = 0
export let Less = -1
export type Comparison = 1 | 0 | -1

export function genUid(): string {
  return Math.random().toString().substring(2, 6)
}

export function clone<T>(object: T): T {
  return Object.assign({}, object)
}

export function assign<T>(t: T, o: Object): T {
  return Object.assign(t, o)
}

export function * specificRange(start: number, stop: number, step: number): Generator<number, void, void> {
  for (let i = start; i < stop; i += step) {
    yield i;
  }
}

export function * range(stop: number): Generator<number, void, void> {
  for (let i of specificRange(0, stop, 1)) {
    yield i;
  }
}

export function maxOfIterable<T>(
  ts: Iterable<T>,
  comparitor: ((t0: T, t1: T) => Comparison)
): T {
  let maxT = undefined
  for (let t of ts) {
    if (maxT === undefined || comparitor(t, maxT) === Greater) {
      maxT = t
    }
  }

  if (maxT === undefined) {
    throw "Couldn't find largest element of sequence"
  }

  return maxT
}
