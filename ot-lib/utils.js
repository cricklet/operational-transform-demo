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
  for (let i = start; i < stop; start += step) {
    yield i;
  }
}

export function * range(stop: number): Generator<number, void, void> {
  for (let i of specificRange(0, stop, 1)) {
    yield i;
  }
}
