/* @flow */

export let Greater = 1
export let Equal = 0
export let Less = -1
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

export function * reverseRange(stop: number): Generator<number, void, void> {
  for (let i of reverseSpecificRange(0, stop, 1)) {
    yield i;
  }
}

export function * reverseSpecificRange(start: number, stop: number, step: number): Generator<number, void, void> {
  let actualStop = start + (Math.ceil((stop - start) / step) - 1) * step // this is tested ;)
  for (let i = actualStop; i >= start; i -= step) {
    yield i;
  }
}

export function firstDifference(text0: string, text1:string) {
  for (let i of range(Math.max(text0.length, text1.length))) {
    if (text0[i] !== text1[i]) {
      return i
    }
  }
  return -1
}

export function lastDifference(text0: string, text1:string) {
  let length = text0.length

  if (text0.length !== text1.length) {
    throw 'The last difference between two strings only works if they are the same length'
  }

  for (let i of reverseRange(length)) {
    if (text0[i] !== text1[i]) {
      return i
    }
  }
  return -1
}

export function * repeat<T>(num: number, f: (i: ?number) => T): Generator<T, void, void> {
  for (let i of range(num)) {
    yield f(i)
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

export function * allKeys(a: Object, b: Object): Generator<string, void, void> {
  let seenKeys = {}
  for (let key of Object.keys(a).concat(Object.keys(b))) {
    if (key in seenKeys) continue
    yield key
    seenKeys[key] = true
  }
}

export function concat<T>(a: Array<T>, t: (T | Array<T>)): Array<T> {
  return a.concat(t) // not mutating :)
}

export function * characters (s: string): Generator<string, void, void> {
  for (let c of s) {
    yield c
  }
}

export function * reverse (s: string): Generator<string, void, void> {
  for (let i of range(s.length)) {
    yield s[i]
  }
}
