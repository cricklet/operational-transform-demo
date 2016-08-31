/* @flow */

export function genUid(): string {
  return Math.random().toString().substring(1, 8)
}
