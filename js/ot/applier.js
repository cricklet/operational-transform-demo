/* @flow */

import * as Components from './components.js'
import type { Insert, Remove, Retain, OpComponent, Operation } from './types.js'

import * as U from '../helpers/utils.js'

export let TextApplier = {
  initial: function (): string {
    return ''
  },
  stateHash: function(text: string): string {
    return text
  },
  apply: function(text: string, operation: Operation)
  : [string, Operation] { // returns [state, undo]
    let i = 0
    let undo = []
    for (let c of operation) {
      Components.handleComponent(c, {
        insert: (insert: Insert) => {
          undo.push(- insert.length)
          text = text.slice(0, i) + insert + text.slice(i)
          i += Components.length(insert)
        },
        remove: (remove: Remove) => {
          let num = Components.length(remove)
          if (i + num > text.length) { throw new Error('wat, trying to delete too much') }
          undo.push(text.slice(i, i + num))
          text = text.slice(0, i) + text.slice(i + num)
        },
        retain: (retain: Retain) => {
          undo.push(retain)
          i += Components.length(retain)
        }
      })

      // make sure we didn't accidentally overshoot
      if (i > text.length) { throw new Error('wat, overshot') }
    }

    return [text, Components.simplify(undo)]
  }
}

//

export type CursorState = {start: number, end: number}
export let CursorApplier = {
  initial: function(): CursorState {
    return {start: 0, end: 0}
  },
  stateHash: function(state: CursorState): string {
    throw new Error('not implemented')
  },
  _adjustPosition: function(pos: number, operation: Operation): number {
    let i = 0
    for (let c of operation) {
      if (i >= pos) { break }

      Components.handleComponent(c, {
        insert: (insert: Insert) => {
          i += Components.length(insert)
          pos += Components.length(insert)
        },
        remove: (remove: Remove) => {
          pos -= Components.length(remove)
        },
        retain: (retain: Retain) => {
          i += Components.length(retain)
        }
      })
    }
    return pos
  },
  apply: function(state: CursorState, operation: Operation): CursorState {
    return {
      start: this._adjustPosition(state.start, operation),
      end: this._adjustPosition(state.end, operation)
    }
  }
}

//

export type DocumentState = {cursor: CursorState, text: string}
export let DocumentApplier = {
  initial: function(): DocumentState {
    return { cursor: CursorApplier.initial(), text: TextApplier.initial() }
  },
  stateHash: function(state: DocumentState): string {
    return TextApplier.stateHash(state.text)
  },
  apply: function(state: DocumentState, operation: Operation): [DocumentState, Operation] {
    let [text, undo] = TextApplier.apply(state.text, operation)
    let cursor = CursorApplier.apply(state.cursor, operation)
    return [
      { cursor: cursor, text: text },
      undo
    ]
  }
}
