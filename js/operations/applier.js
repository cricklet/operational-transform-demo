/* @flow */

import * as O from './operations.js'
import type {
  Insert, Remove, Retain, Op
} from './operations.js'

import * as U from '../helpers/utils.js'

export let TextApplier = {
  initial: function (): string {
    return ''
  },
  stateHash: function(text: string): string {
    return text
  },
  apply: function(text: string, ops: Op[])
  : [string, Op[]] { // returns [state, undo]
    let i = 0
    let undo = []
    for (let op of ops) {
      O.switchOnOp(op, {
        insert: (insert: Insert) => {
          undo.push(- insert.length)
          text = text.slice(0, i) + insert + text.slice(i)
          i += O.length(insert)
        },
        remove: (remove: Remove) => {
          let num = O.length(remove)
          if (i + num > text.length) { throw new Error('wat, trying to delete too much') }
          undo.push(text.slice(i, i + num))
          text = text.slice(0, i) + text.slice(i + num)
        },
        retain: (retain: Retain) => {
          undo.push(retain)
          i += O.length(retain)
        }
      })

      // make sure we didn't accidentally overshoot
      if (i > text.length) { throw new Error('wat, overshot') }
    }

    return [text, O.simplify(undo)]
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
  _adjustPosition: function(pos: number, ops: Op[]): number {
    let i = 0
    for (let op of ops) {
      if (i >= pos) { break }

      O.switchOnOp(op, {
        insert: (insert: Insert) => {
          i += O.length(insert)
          pos += O.length(insert)
        },
        remove: (remove: Remove) => {
          pos -= O.length(remove)
        },
        retain: (retain: Retain) => {
          i += O.length(retain)
        }
      })
    }
    return pos
  },
  apply: function(state: CursorState, ops: Op[]): CursorState {
    return {
      start: this._adjustPosition(state.start, ops),
      end: this._adjustPosition(state.end, ops)
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
  apply: function(state: DocumentState, ops: Op[]): [DocumentState, Op[]] {
    let [text, undo] = TextApplier.apply(state.text, ops)
    let cursor = CursorApplier.apply(state.cursor, ops)
    return [
      { cursor: cursor, text: text },
      undo
    ]
  }
}
