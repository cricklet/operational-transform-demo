/* @flow */

import {Record as ImmutableRecord} from 'immutable';
import { merge } from './utils'

/**
 * Used to define an Immutable Record type.
 * > type ABRecord = Record<{a: number, b: number}>
 */
export type Record<O: Object> = {
  merge: (o?: $Shape<O>) => Record<O>;
} & O;

export type RecordFactory<O> = (init?: $Shape<O>) => Record<O>

/**
 * Create a factory for an Immutable Record type.
 * > const ABRecordFactory = RecordFactory({a: 3, b:3});
 */
export function generateRecordFactory<O: Object>(... keys: Array<$Keys<O>>)
: RecordFactory<O> {
  let defaults = {}
  for (let k of keys) {
    defaults[k] = undefined
  }
  const RecordClass = ImmutableRecord(defaults);

  return (init: $Shape<O>) => {
    if (init == null) {
      throw new Error('missing initialization object')
    }
    for (let k of keys) {
      if (!(k in init)) {
        throw new Error(`missing key: ${k} from record initialization`)
      }
    }
    for (let k in init) {
      if (!(k in defaults)) {
        throw new Error(`missing key: ${k} from record factory description`)
      }
    }
    return new RecordClass(init);
  };
}

// Borrowed from https://github.com/facebook/immutable-js/issues/203
