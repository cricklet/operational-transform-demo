/* @flow */

export interface IApplier<O,S> {
  stateString(s: S): string,
  apply(state: S, op: O): S,
  inferOs(oldState: S, newState: S): ?O,
}

export interface ITransformer<O> {
  transformNullable(clientOp: ?O, serverOp: ?O): [?O, ?O],
  transform(clientOp: O, serverOp: O): [O, O],
  composeNullable (op1: ?O, ops2P: ?O): ?O,
  compose(op1: O, op2: O): O,
  composeMany(ops: Iterable<O>): O,
}
