/* @flow */

export interface IApplier<O,S> {
  stateString(s: S): string,
  apply(state: S, ops: O[]): S
}

export interface IInferrer<O,S> {
  inferOps(state: S, newState: S): ?O[]
}

export interface ITransformer<O> {
  transformNullable(clientOps: ?O[], serverOps: ?O[]): [?O[], ?O[]],
  transform(clientOps: O[], serverOps: O[]): [O[], O[]],
  composeNullable (ops1: ?O[], ops2P: ?O[]): ?O[],
  compose(ops1: O[], ops2: O[]): O[],
  composeMany(ops: Iterable<O[]>): O[],
}
