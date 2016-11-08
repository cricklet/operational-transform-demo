/* @flow */

import { zip, zipLongest } from 'wu'

export type Reiterable<T> = () => Iterable<T>

export let Greater = 1
export let Equal = 0
export let Less = -1
export type Comparison = 1 | 0 | -1

export type Comparitor<T> = (a: T, b: T) => Comparison
// returns Greater if a  >  b
//         Less    if a  <  b
//         Equal   if a === b

export function reiterable <T> (it: Iterable<T>): Reiterable<T> {
  return () => it
}

export function genUid(): string {
  return Math.random().toString().substring(2, 6)
}

export function clone<T>(object: T): T {
  return Object.assign({}, object)
}

export function assign<T>(t: T, o: Object): T {
  return Object.assign(t, o)
}

export function specificRange(start: number, stop: number, step: number): Reiterable<number> {
  return function * () {
    for (let i = start; i < stop; i += step) {
      yield i;
    }
  }
}

export function map<T1, T2>(t1s: Reiterable<T1>, f: (t1: T1) => T2): Reiterable<T2> {
  return function * () {
    for (let t1 of t1s()) {
      yield f(t1)
    }
  }
}

export function rearray<T>(is: Reiterable<T>): Array<T> {
  return Array.from(is())
}

export function restring<T>(is: Reiterable<T>): string {
  return Array.from(is()).join('')
}

export function range(stop: number): Reiterable<number> {
  return specificRange(0, stop, 1)
}

export function reverseRange(stop: number): Reiterable<number> {
  return reverseSpecificRange(0, stop, 1)
}

export function reverseSpecificRange(start: number, stop: number, step: number): Reiterable<number> {
  return function * () {
    let actualStop = start + (Math.ceil((stop - start) / step) - 1) * step // this is tested ;)
    for (let i = actualStop; i >= start; i -= step) {
      yield i;
    }
  }
}

export function reverseString(s: string): Reiterable<string> {
  return map(reverseRange(s.length), i => s[i])
}

export function * counter(): Generator<number, void, void> {
  let i = 0
  while (true) {
    yield i
    i += 1
  }
}

export function length<T>(s: Reiterable<T>): number {
  let length = 0
  for (let c of s()) {
    length += 1
  }
  return length
}

export function calculatePrefixLength(text0: Reiterable<string>, text1: Reiterable<string>) {
  for (let [[c0, c1], i] of zip(zipLongest(text0(), text1()), counter())) {
    if (c0 != c1) {
      return i
    }
  }
  return Math.max(length(text0), length(text1))
}

export function calculatePostfixLength(text0: string, text1: string): number {
  return calculatePrefixLength(reverseString(text0), reverseString(text1))
}

export function repeat<T>(num: number, f: (i: number) => T): Reiterable<T> {
  return map(range(num), f)
}

export function maxOfIterable<T>(
  ts: Reiterable<T>,
  comparitor: Comparitor<T>
): T {
  let maxT = undefined
  for (let t of ts()) {
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

export function concat<T1, T2>(a: Array<T1>, t: Array<T2>): Array<T1 | T2> {
  return a.concat(t) // not mutating :)
}

export function push<T1, T2>(a: Array<T1>, t: T2): Array<T1 | T2> {
  return a.concat(t) // not mutating :)
}

export function characters (
  s: string,
  indices: ?Reiterable<number>
): Reiterable<string> {
  if (!indices) {
    indices = range(s.length);
  }

  return map(indices, i => s[i])
}

export function defaults<T> (t: ?T, def: T): T {
  if (t === undefined || t === null) {
    return def;
  }

  return t;
}

export function substring (
  s: string,
  opt: {
    start?: number,
    stop?:  number,
    step?:  number
  }
): Reiterable<string> {
  let start: number = defaults(opt.start, 0);
  let stop:  number = defaults(opt.stop, s.length);
  let step:  number = defaults(opt.step, 1);

  return characters(s, specificRange(start, stop, step))
}

export function subarray <T> (
  arr: Array<T>,
  opt: {
    start?: number,
    stop?:  number,
    step?:  number
  }
): Reiterable<T> {
  let start: number = defaults(opt.start, 0);
  let stop:  number = defaults(opt.stop, arr.length);
  let step:  number = defaults(opt.step, 1);

  return map(specificRange(start, stop, step), i => arr[i])
}

export function removeTail (
  s: string,
  n: number
): Reiterable<string> {
  return substring(s, { stop: s.length - n })
}

export function reverse <T> (arr: Array<T>): Reiterable<T> {
  return map(reverseRange(arr.length), i => arr[i])
}

export function findIndex <T> (f: (t: T) => bool, arr: Array<T>): ?number {
  for (let [t, i] of zip(arr, counter())) {
    if (f(t)) {
      return i
    }
  }

  return undefined
}

export function findLastIndex <T> (f: (t: T) => bool, arr: Array<T>): ?number {
  for (let i = arr.length - 1; i >= 0; i --) {
    if (f(arr[i])) {
      return i
    }
  }

  return undefined
}
