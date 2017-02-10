/* @flow */

export interface IApplier<O,S> {
  initial(): S,
  stateHash(s: S): string,
  apply(state: S, ops: O[]): S,
  applyNullable(state: S, ops: ?O[]): S
}

export interface IInferrer<O,S> {
  infer(state: S, newState: S): [?O[], ?O[]]
}

export interface IOperator<O> {
  transformNullable(clientOps: ?O[], serverOps: ?O[]): [?O[], ?O[]],
  transform(clientOps: O[], serverOps: O[]): [O[], O[]],
  composeNullable (ops1: ?O[], ops2P: ?O[]): ?O[],
  compose(ops1: O[], ops2: O[]): O[],
  composeMany(ops: Iterable<O[]>): O[],
}
