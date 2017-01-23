/* @flow */

import { zip, zipLongest, take } from 'wu'

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

export function iterable <T> (it: Reiterable<T>): Iterable<T> {
  return it()
}

export function genUid(): string {
  return Math.random().toString().substring(2, 6)
}

export function clone<T>(object: T): T {
  // @flow-ignore
  return Object.assign({}, object)
}

export function merge<A, B, C: A & B>(a: A, b: B): C {
  // @flow-ignore
  return Object.assign(clone(a), b)
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

export function insert<T1, T2>(a: Array<T1>, t: T2, i: number): Array<T1 | T2> {
  return a.slice(0, i).concat([t]).concat(a.slice(i))
}

export function remove<T>(a: Array<T>, i: number): Array<T> {
  return a.slice(0, Math.max(0, i - 1)).concat(a.slice(i))
}

export function popRandom<T>(a: Array<T>): T {
  let i = Math.floor(Math.random() * a.length);
  return a.pop(i)
}

export function allEqual<T>(as: T[]): boolean {
  let val = as[0]
  for (let a of as) {
    if (val !== a) {
      return false
    }
  }
  return true
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

export function hashCode (str: string): number {
  // taken from stack overflow
  let hash = 0;
  if (str.length == 0)
    return hash;

  for (let i = 0; i < str.length; i++) {
    let char = str.charCodeAt(i);
    hash = ((hash<<5)-hash)+char;
    hash = hash & hash;
  }
  return hash;
}

export function hash (str: string): string {
  return '' + hashCode(str) % 10000
}

export function last <T> (arr: Array<T>): T {
  if (arr.length === 0) { throw new Error('wat no last') }
  return arr[arr.length - 1]
}

export function first <T> (arr: Array<T>): T {
  if (arr.length === 0) { throw new Error('wat no first') }
  return arr[0]
}

export function maybeLast <T> (arr: Array<T>): ?T {
  return arr[arr.length - 1]
}

export function maybeFirst <T> (arr: Array<T>): ?T {
  return arr[0]
}

export function maybePush <T> (arr: Array<T>, a: ?T): Array<T> {
  if (a == null) { return arr }
  else { return push(arr, a) }
}

export type Tree<A> = Array<Tree<A> | A>

export function flatten <A> (tree: Tree<A>): Array<A> {
  let as = []

  let f = (subtree: Tree<A>) => {
    for (let a: A | Tree<A> of subtree) {
      if (Array.isArray(a)) {
        f(a)
      } else {
        as.push(a)
      }
    }
  }

  f(tree)

  return as
}

export function shuffle <T> (arr: Array<T>): Reiterable<T> {
  let indices = Array.from(take(arr.length, counter()))
  let i = indices.length

  while (0 !== i) {
    let randomI = Math.floor(Math.random() * i);
    i --;

    // And swap it with the current element.
    let value = indices[i];
    indices[i] = indices[randomI];
    indices[randomI] = value;
  }

  return function * () {
    for (let index of indices) {
      yield arr[index]
    }
  }
}

export function zipPairs <T> (arr: Array<T>): Reiterable<[T ,T]> {
  return function * () {
    for (let i = 0; i < arr.length - 1; i ++) {
      yield [arr[i], arr[i+1]]
    }
  }
}

export function pop <T> (arr: Array<T>, f: (t: T) => boolean): ?T {
  for (let i = 0; i < arr.length; i ++) {
    if (f(arr[i])) {
      let t = arr[i]
      arr.splice(i, 1)
      return t
    }
  }
  return undefined
}

export function contains <T> (arr: Array<T>, t: T): boolean {
  for (let i = 0; i < arr.length; i ++) {
    if (t === arr[i]) {
      return true
    }
  }
  return false
}

export async function asyncWait(ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}
