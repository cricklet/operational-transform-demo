/* @flow */

import * as Components from './components.js'
import type { Insert, Remove, Retain, OpComponent } from './components.js'

import * as U from '../helpers/utils.js'


export let inferOperation = function(oldText: string, newText: string)
: ?OpComponent[] {
  if (oldText.length === newText.length) {
    // we have a no-op
    if (oldText === newText) {
      return undefined;
    }
  }

  if (newText.length === 0) {
    return [ - oldText.length ]
  }

  if (oldText.length === 0) {
    return [ newText ]
  }

  // or we have a selection being overwritten.
  let postfixLength = U.calculatePostfixLength(oldText, newText)
  let newTextLeftover = U.removeTail(newText, postfixLength)
  let oldTextLeftover = U.removeTail(oldText, postfixLength)
  let prefixLength = U.calculatePrefixLength(oldTextLeftover, newTextLeftover)

  let start = prefixLength
  let endOld = oldText.length - postfixLength
  let endNew = newText.length - postfixLength

  return [ // update
    Components.createRetain(start),
    Components.createRemove(endOld - start),
    Components.createInsert(U.string(U.substring(newText, {start: start, stop: endNew})))
  ]
}
