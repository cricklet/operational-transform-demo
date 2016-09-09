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
