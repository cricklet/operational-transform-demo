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

type $RecordCreator<O: Object> = (def?: $Shape<O>) => Record<O>;

/**
 * Create a factory for an Immutable Record type.
 * > const ABRecordFactory = RecordFactory({a: 3, b:3});
 */
export function RecordFactory<O: Object>(defaults: $Shape<O>, optionalKeys: ?Array<string>): $RecordCreator<O> {
  if (optionalKeys == null) {
    optionalKeys = []
  }
  const RecordClass = ImmutableRecord(defaults);
  return (init: $Shape<O>) => {
    if (init == null) {
      throw new Error('missing initialization object')
    }
    for (let k of Object.keys(defaults)) {
      if (!(k in init)) {
        throw new Error(`missing key: ${k} from initialization`)
      }
    }
    return new RecordClass(init);
  };
}

// Borrowed from https://github.com/facebook/immutable-js/issues/203
