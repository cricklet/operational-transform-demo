/* @flow */

export let Greater = 'Greater'
export let Equal = 'Equal'
export let Less = 'Less'
export type Comparison = 1 | 0 | -1

export type Comparitor<T> = (a: T, b: T) => Comparison
// returns Greater if a  >  b
//         Less    if a  <  b
//         Equal   if a === b

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
  comparitor: Comparitor<T>
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
