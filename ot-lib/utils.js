/* @flow */

export function genUid(): string {
  return Math.random().toString().substring(2, 6)
}
