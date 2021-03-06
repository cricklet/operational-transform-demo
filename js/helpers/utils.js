/* @flow */

import * as Wu from 'wu'

import { IterableBase } from './iterable_base.js'

export let Greater = 1
export let Equal = 0
export let Less = -1
export type Comparison = 1 | 0 | -1

export type Comparitor<T> = (a: T, b: T) => Comparison
// returns Greater if a  >  b
//         Less    if a  <  b
//         Equal   if a === b

export class SafeIterable<T> extends IterableBase {
  ts: () => Iterable<T>
  constructor(ts: () => Iterable<T>) {
    super()
    this.ts = ts
  }
  iterator (): Iterable<T> {
    return this.ts()
  }
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

export function specificRange(start: number, stop: number, step: number): SafeIterable<number> {
  return new SafeIterable(function * () {
    for (let i = start; i < stop; i += step) {
      yield i;
    }
  })
}

export function map<T1, T2>(t1s: Iterable<T1>, f: (t1: T1) => T2): SafeIterable<T2> {
  return new SafeIterable(function * () {
    for (let t1 of t1s) {
      yield f(t1)
    }
  })
}

export function objectFrom<T> (tuples: Iterable<[string, T]>)
: {[key: string]: T} {
  let obj = {}
  for (let [key, t] of tuples) {
    obj[key] = t
  }
  return obj
}

export function array<T>(is: Iterable<T>): Array<T> {
  return Array.from(is)
}

export function string<T>(is: Iterable<T>): string {
  return Array.from(is).join('')
}

export function range(stop: number): SafeIterable<number> {
  return specificRange(0, stop, 1)
}

export function reverseRange(stop: number): SafeIterable<number> {
  return reverseSpecificRange(0, stop, 1)
}

export function reverseSpecificRange(start: number, stop: number, step: number): SafeIterable<number> {
  return new SafeIterable(function * () {
    let actualStop = start + (Math.ceil((stop - start) / step) - 1) * step // this is tested ;)
    for (let i = actualStop; i >= start; i -= step) {
      yield i;
    }
  })
}

export function reverseString(s: string): SafeIterable<string> {
  return map(reverseRange(s.length), i => s[i])
}

export function * counter(): Generator<number, void, void> {
  let i = 0
  while (true) {
    yield i
    i += 1
  }
}

export function length<T>(s: Iterable<T>): number {
  let length = 0
  for (let c of s) {
    length += 1
  }
  return length
}

export function calculatePrefixLength(
  text0: SafeIterable<string> | string,
  text1: SafeIterable<string> | string
) {
  for (let [[c0, c1], i] of zip(zipLongest(text0, text1), counter())) {
    if (c0 != c1) {
      return i
    }
  }
  return Math.max(length(text0), length(text1))
}

export function calculatePostfixLength(text0: string, text1: string): number {
  return calculatePrefixLength(reverseString(text0), reverseString(text1))
}

export function repeat<T>(num: number, f: (i: number) => T): SafeIterable<T> {
  return map(range(num), f)
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

export function removeInPlace<T>(a: Array<T>, i: number) {
  a.splice(i, 1)
}

export function removeLastInPlace<T>(a: Array<T>, i: number) {
  a.pop()
}

export function popRandom<T>(a: Array<T>): T {
  let i = Math.floor(Math.random() * a.length);
  let result = a[i]
  remove(a, i)
  return result
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
  indices: ?SafeIterable<number>
): SafeIterable<string> {
  if (!indices) {
    indices = range(s.length);
  }

  return map(indices, i => s[i])
}

export function filter<T>(ts: Iterable<T>, f: (t: T) => boolean)
: SafeIterable<T> {
  return new SafeIterable(function * () {
    for (let t of ts) {
      if (f(t)) {
        yield t
      }
    }
  })
}

/* @flow-ignore */
export function skipNulls<T>(ts: Iterable<?T>): SafeIterable<T> {
  return filter(ts, t => t != null)
}

export function defaultFallback<T> (t: ?T, def: T): T {
  if (t === undefined || t === null) {
    return def;
  }

  return t;
}

export function fillDefaults<T: Object>(t: ?$Shape<T>, defaults: T): T {
  return merge(defaults, t || {})
}

export function substring (
  s: string,
  opt: {
    start?: number,
    stop?:  number,
    step?:  number
  }
): SafeIterable<string> {
  let start: number = defaultFallback(opt.start, 0);
  let stop:  number = defaultFallback(opt.stop, s.length);
  let step:  number = defaultFallback(opt.step, 1);

  return characters(s, specificRange(start, stop, step))
}

export function subarray <T> (
  arr: Array<T>,
  opt: {
    start?: number,
    stop?:  number,
    step?:  number
  }
): SafeIterable<T> {
  let start: number = defaultFallback(opt.start, 0);
  let stop:  number = defaultFallback(opt.stop, arr.length);
  let step:  number = defaultFallback(opt.step, 1);

  return map(specificRange(start, stop, step), i => arr[i])
}

export function removeTail (
  s: string,
  n: number
): SafeIterable<string> {
  return substring(s, { stop: s.length - n })
}

export function reverse <T> (arr: Array<T>): SafeIterable<T> {
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

export function find <T> (f: (t: T) => bool, arr: Array<T>): ?T {
  let i = findIndex(f, arr)
  if (i == null) {
    return undefined
  }

  return arr[i]
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

export function zipPairs <T> (arr: Array<T>): SafeIterable<[T ,T]> {
  return new SafeIterable(function * () {
    for (let i = 0; i < arr.length - 1; i ++) {
      yield [arr[i], arr[i+1]]
    }
  })
}

export function zipLongest <T1,T2> (t1s: Iterable<T1>, t2s: Iterable<T2>): SafeIterable<[T1 ,T2]> {
  return new SafeIterable(function * () {
    for (let [t1: T1, t2: T2] of Wu.zipLongest(t1s, t2s)) {
      yield [t1, t2]
    }
  })
}

export function zip <T1,T2> (t1s: Iterable<T1>, t2s: Iterable<T2>): SafeIterable<[T1 ,T2]> {
  return new SafeIterable(function * () {
    for (let [t1: T1, t2: T2] of Wu.zip(t1s, t2s)) {
      yield [t1, t2]
    }
  })
}

export function all<T>(arr: Iterator<T>, f: (t: T) => boolean): boolean {
  for (let a of arr) {
    if (f(a) === false) return false
  }

  return true
}

export function filterInPlace <T> (arr: Array<T>, f: (t: T) => boolean): void {
  for (let i = 0; i < arr.length; i ++) {
    if (f(arr[i]) === false) {
      arr.splice(i, 1)
      i --
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


export class Notify {
  _unlock: () => void
  _lock: ?Promise<*>

	constructor() {
    this._unlock = () => {}
		this.setup()
	}
	setup() {
		this._lock = new Promise(resolve => { this._unlock = resolve })
	}
	async wait() {
		await this._lock
	}
	async notify() {
		this._unlock()
		this.setup()
	}
}

export class NotifyAfter {
  _unlock: () => void
  _lock: ?Promise<*>
  _num: number

	constructor(num: number) {
    this._num = num
    this._unlock = () => {}
		this._lock = new Promise(resolve => { this._unlock = resolve })
	}
	async wait() {
    if (this._num === 0) {
      return
    } else {
	    await this._lock
    }
	}
	async notify() {
    this._num -= 1
    if (this._num < 0) {
      throw new Error('received too many notifies')
    }
    if (this._num === 0) {
  		this._unlock()
    }
	}
}

export class NotifyOnce extends NotifyAfter {
	constructor() {
    super(1)
	}
}


export function asyncSleep(time: number): Promise<null> {
  return new Promise((resolve, reject) => setTimeout(resolve, time))
}
