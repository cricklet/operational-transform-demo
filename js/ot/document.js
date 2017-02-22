/* @flow */

import * as Components from './components.js'
import type { Insert, Remove, Retain, OpComponent, Operation } from './types.js'

import * as U from '../helpers/utils.js'

export interface IDocument {
  hash(): string,
  text(): string,
  apply(operation: Operation): Operation // undo
}

class TextDocument {
  text: string
  constructor(initial?: string) {
    if (initial == null) {
      this.text = ''
    } else {
      this.text = initial
    }
  }

  hash(): string {
    return this.text
  }

  apply(operation: Operation): Operation {
    let i = 0
    let undo = []

    let text = this.text

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

    this.text = text

    return Components.simplify(undo)
  }
}

function adjustCursor(pos: number, operation: Operation): number {
  let i = 0
  for (let c of operation) {
    if (i > pos) { break }

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
}

export class Document {
  cursor: { start: number, end: number }
  textDocument: TextDocument

  constructor() {
    this.cursor = { start: 0, end: 0 }
    this.textDocument = new TextDocument()
  }
  hash(): string {
    return this.textDocument.hash()
  }
  apply(operation: Operation): Operation {
    let undo = this.textDocument.apply(operation)
    this.cursor = {
      start: adjustCursor(this.cursor.start, operation),
      end: adjustCursor(this.cursor.end, operation)
    }
    return undo
  }
}
