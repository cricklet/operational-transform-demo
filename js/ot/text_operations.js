/* @flow */

import { last, removeInPlace, hash, clone, genUid, rearray, repeat, calculatePostfixLength, removeTail, calculatePrefixLength, substring, restring, all } from './utils.js'
import { map } from 'wu'
import { IOperator, IApplier, IInferrer } from './operations.js'


//

type LinearOpKind = 'Delete'|'Insert'|'Placeholder'|'Retain'

type ILinearOp = {
  kind(): LinearOpKind,
  length(): number,
  split(pos: number): [ILinearOp, ILinearOp],
  join(next: ILinearOp): ?ILinearOp
} | Retain // retains can't be custom... they're just fill space

//

export function generateInsertion(pos: number, text: string): TextOperation[] {
  return [
    new Retain(pos), new InsertText(text)
  ]
}

export function generateDeletion(pos: number, n: number): TextOperation[] {
  return [
    new Retain(pos), new Delete(n)
  ]
}

class InsertText {
  text: string

  constructor(text: string) {
    (this: ILinearOp)
    this.text = text
  }
  toString(): string {
    return `insert "${this.text}"`
  }
  kind(): LinearOpKind {
    return 'Insert'
  }
  split (offset: number): [ILinearOp, ILinearOp] {
    if (offset < 0 || offset > this.text.length) {
      throw new Error()
    }
    return [
      new InsertText(this.text.substring(0, offset)),
      new InsertText(this.text.substring(offset))
    ]
  }
  join (next: ILinearOp): ?ILinearOp {
    if (next instanceof InsertText) {
      return new InsertText(this.text + next.text)
    }
  }
  length(): number {
    return this.text.length
  }
}

class Delete {
  num: number

  constructor(num: number) {
    (this: ILinearOp)
    this.num = num
  }
  toString(): string {
    return `delete #${this.num}`
  }
  kind(): LinearOpKind {
    return 'Delete'
  }
  split (offset: number): [ILinearOp, ILinearOp] {
    if (offset < 0 || offset > this.num) {
      throw new Error()
    }
    return [
      new Delete(offset),
      new Delete(this.num - offset)
    ]
  }
  join (next: ILinearOp): ?ILinearOp {
    if (next instanceof Delete) {
      return new Delete(this.num + next.num)
    }
  }
  length(): number {
    return this.num
  }
}

class Retain {
  num: number

  constructor(num: number) {
    (this: ILinearOp)
    this.num = num
  }
  toString(): string {
    return `retain #${this.num}`
  }
  kind(): LinearOpKind {
    return 'Retain'
  }
  split (offset: number): [ILinearOp, ILinearOp] {
    if (offset < 0 || offset > this.num) {
      throw new Error()
    }
    return [
      new Retain(offset),
      new Retain(this.num - offset)
    ]
  }
  join (next: ILinearOp): ?ILinearOp {
    if (next instanceof Retain) {
      return new Retain(this.num + next.num)
    }
  }
  length(): number {
    return this.num
  }
}

//


export class LinearOperator<O: ILinearOp> {
  constructor() {
    (this: IOperator<O>)
  }
  simplify(ops: O[]): O[] {
    for (let i = 1; i < ops.length; i ++) {
      let newOp = ops[i - 1].join(ops[i])
      if (newOp != null) {
        ops[i - 1] = newOp
        removeInPlace(ops, i) // remove extra op
        i --
      }
    }

    if (ops.length > 0 && last(ops).kind() === 'Retain') {
      ops.pop() // remove trailing retain
    }

    return ops
  }
  _transformConsumeOps(a: ?O, b: ?O)
  : [[?O, ?O], [?O, ?O]] {
    // returns [[aP, bP], [a, b]]

    if (a != null && a.kind() === 'Insert') {
      return [[a, new Retain(a.length())], [undefined, b]]
    }

    if (b != null && b.kind() === 'Insert') {
      return [[new Retain(b.length()), b], [a, undefined]]
    }

    // neither is null
    if (a != null && b != null) {
      let minLength = Math.min(a.length(), b.length())

      let [aHead, aTail] = a.split(minLength)
      let [bHead, bTail] = b.split(minLength)

      if (aHead.length() === 0) { aHead = undefined }
      if (aTail.length() === 0) { aTail = undefined }
      if (bHead.length() === 0) { bHead = undefined }
      if (bTail.length() === 0) { bTail = undefined }

      if (a.kind() === 'Retain' && b.kind() === 'Retain') {
        return [[aHead, bHead], [aTail, bTail]]
      }
      if (a.kind() === 'Delete' && b.kind() === 'Retain') {
        return [[aHead, undefined], [aTail, bTail]]
      }
      if (a.kind() === 'Retain' && b.kind() === 'Delete') {
        return [[undefined, bHead], [aTail, bTail]]
      }
      if (a.kind() === 'Delete' || b.kind() === 'Delete') {
        return [[undefined, undefined], [aTail, bTail]] // both do the same thing
      }
      if (a.kind() === 'Insert' || b.kind() === 'Insert') {
        throw new Error('wat, should be handled already')
      }
      throw new Error('wat')
    }

    // one is null
    if (a != null) { return [[a, undefined], [undefined, b]] }
    if (b != null) { return [[undefined, b], [a, undefined]] }

    throw new Error('wat')
  }
  transformNullable(clientOps: ?O[], serverOps: ?O[])
  : [?O[], ?O[]] {
    if (clientOps != null && serverOps != null) {
      let [newClientOps, newServerOps] = this.transform(clientOps, serverOps)
      return [newClientOps, newServerOps]
    } else {
      return [clientOps, serverOps]
    }
  }
  transform(clientOps: O[], serverOps: O[])
  : [O[], O[]] {
    let ops1 = clientOps
    let ops2 = serverOps

    let ops1P = []
    let ops2P = []

    let i1 = 0
    let i2 = 0

    let op1: ?O = undefined
    let op2: ?O = undefined

    while (true) {
      if (op1 == null) { op1 = ops1[i1]; i1++ }
      if (op2 == null) { op2 = ops2[i2]; i2++ }

      if (op1 == null && op2 == null) { break }

      if ((op1 != null && op1.length() <= 0)) {
        op1 = null;
        continue
      }

      if ((op2 != null && op2.length() <= 0)) {
        op2 = null;
        continue
      }

      let [[op1P, op2P], [newOp1, newOp2]] = this._transformConsumeOps(op1, op2)

      if (op1P != null) { ops1P.push(op1P) }
      if (op2P != null) { ops2P.push(op2P) }

      [op1, op2] = [newOp1, newOp2]
    }

    return [this.simplify(ops1P), this.simplify(ops2P)]
  }
  composeNullable (ops1: ?O[], ops2: ?O[])
  : ?O[] {
    if (ops1 != null && ops2 != null) {
      return this.compose(ops1, ops2)
    } else if (ops1 != null) {
      return ops1
    } else if (ops2 != null) {
      return ops2
    } else {
      return undefined
    }
  }
  _composeConsumeOps(a: ?O, b: ?O)
  : [?O, [?O, ?O]] {
    // returns [newOp, [a, b]]

    if (a != null && a.kind() === 'Delete') {
      return [a, [undefined, b]]
    }

    if (b != null && b.kind() === 'Insert') {
      return [b, [a, undefined]]
    }

    // neither op is null!
    if (a != null && b != null) {
      let minLength = Math.min(a.length(), b.length())

      let [aHead, aTail] = a.split(minLength)
      let [bHead, bTail] = b.split(minLength)

      if (aHead.length() === 0) { aHead = undefined }
      if (aTail.length() === 0) { aTail = undefined }
      if (bHead.length() === 0) { bHead = undefined }
      if (bTail.length() === 0) { bTail = undefined }

      if (a.kind() === 'Retain' && b.kind() === 'Retain') {
        return [aHead, [aTail, bTail]]
      }
      if (a.kind() === 'Insert' && b.kind() === 'Retain') {
        return [aHead, [aTail, bTail]]
      }
      if (a.kind() === 'Retain' && b.kind() === 'Delete') {
        return [bHead, [aTail, bTail]]
      }
      if (a.kind() === 'Insert' && b.kind() === 'Delete') {
        return [undefined, [aTail, bTail]] // delete the inserted portion
      }
      if (a.kind() === 'Delete' && b.kind() === 'Insert') {
        throw new Error('wat, should be handled already')
      }
      if (a.kind() === 'Delete' && b.kind() === 'Delete') {
        throw new Error('wat, should be handled already')
      }
      if (a.kind() === 'Insert' && b.kind() === 'Insert') {
        throw new Error('wat, should be handled already')
      }
      throw new Error('wat')
    }

    // one of the two ops is null!
    if (a != null) { return [a, [undefined, b]] }
    if (b != null) { return [b, [a, undefined]] }

    throw new Error('wat')
  }
  compose(ops1: O[], ops2: O[])
  : O[] {
    // compose (ops1, ops2) to composed s.t.
    // apply(apply(text, ops1), ops2) === apply(text, composed)

    // code borrowed from https://github.com/Operational-Transformation/ot.py/blob/master/ot/text_operation.py#L219

    let composed = []

    let i1 = 0
    let i2 = 0

    let op1: ?O = undefined
    let op2: ?O = undefined

    while (true) {
      if (op1 == null) { op1 = ops1[i1]; i1++ }
      if (op2 == null) { op2 = ops2[i2]; i2++ }

      if (op1 == null && op2 == null) { break }

      if ((op1 != null && op1.length() <= 0)) {
        op1 = null;
        continue
      }

      if ((op2 != null && op2.length() <= 0)) {
        op2 = null;
        continue
      }

      let [composedOp, [newOp1, newOp2]] = this._composeConsumeOps(op1, op2)

      if (composedOp != null) { composed.push(composedOp) }
      [op1, op2] = [newOp1, newOp2]
    }

    return this.simplify(composed)
  }
  composeMany(ops: Iterable<O[]>)
  : O[] {
    let composed: O[] = []
    for (let op of ops) {
      composed = this.compose(composed, op)
    }
    return composed
  }
}

//

export type TextOperation = InsertText | Delete | Retain

export class TextApplier {
  constructor() {
    (this: IApplier<TextOperation, string>)
  }
  initial(): string {
    return ''
  }
  stateHash(text: string): string {
    return text
  }
  applyNullable(text: string, ops: ?TextOperation[]): string {
    if (ops == null) {
      return text
    }
    return this.apply(text, ops)
  }
  apply(text: string, ops: TextOperation[]): string {
    let i = 0
    for (let op of ops) {
      if (op instanceof InsertText) {
        text = text.slice(0, i) + op.text + text.slice(i)
        i += op.text.length
      }

      if (op instanceof Retain) {
        if (op.num < 0) { throw new Error('wat, failed to retain') }
        i += op.num
      }

      if (op instanceof Delete) {
        if (op.num < 0) { throw new Error('wat, failed to delete') }
        if (i + op.num > text.length) { throw new Error('wat, trying to delete too much') }
        text = text.slice(0, i) + text.slice(i + op.num)
      }

      // make sure we didn't accidentally overshoot
      if (i > text.length) { throw new Error('wat, overshot') }
    }

    return text
  }
}

export class TextInferrer {
  constructor() {
    (this: IInferrer<TextOperation, string>)
  }
  infer(oldText: string, newText: string)
  : [?TextOperation[], ?TextOperation[]] { // infer update & undo
    if (oldText.length === newText.length) {
      // we have a no-op
      if (oldText === newText) {
        return [undefined, undefined];
      }
    }

    if (newText.length === 0) {
      return [
        [new Delete(oldText.length)],
        [new InsertText(oldText)] // undo
      ]
    }

    if (oldText.length === 0) {
      return [
        [new InsertText(newText)],
        [new Delete(newText.length)] // undo
      ]
    }

    // or we have a selection being overwritten.
    let postfixLength = calculatePostfixLength(oldText, newText)
    let newTextLeftover = removeTail(newText, postfixLength)
    let oldTextLeftover = removeTail(oldText, postfixLength)
    let prefixLength = calculatePrefixLength(oldTextLeftover, newTextLeftover)

    let start = prefixLength
    let endOld = oldText.length - postfixLength
    let endNew = newText.length - postfixLength

    return [
      [ // update
        new Retain(start),
        new Delete(endOld - start),
        new InsertText(restring(substring(newText, {start: start, stop: endNew})))
      ],
      [ // undo
        new Retain(start),
        new InsertText(restring(substring(oldText, {start: start, stop: endOld}))),
        new Delete(endNew - start)
      ]
    ]
  }
}

//

export type CursorState = {start: number, end: number}

export class CursorApplier {
  constructor() {
    (this: IApplier<TextOperation, CursorState>)
  }
  initial(): CursorState {
    return {start: 0, end: 0}
  }
  applyNullable(s: CursorState, ops: ?TextOperation[]): CursorState {
    if (ops == null) {
      return s
    }
    return this.apply(s, ops)
  }
  stateHash(state: CursorState): string {
    throw new Error('not implemented')
  }
  _adjustPosition(pos: number, ops: TextOperation[]): number {
    let i = 0
    for (let op of ops) {
      if (i >= pos) { break }

      if (op instanceof InsertText) {
        i += op.length()
        pos += op.length()
      }

      if (op instanceof Retain) {
        i += op.num
      }

      if (op instanceof Delete) {
        pos -= op.length()
      }
    }
    return pos
  }
  apply(state: CursorState, ops: TextOperation[]): CursorState {
    return {
      start: this._adjustPosition(state.start, ops),
      end: this._adjustPosition(state.end, ops)
    }
  }
}

//

export type DocumentState = {cursor: CursorState, text: string}

export class DocumentApplier {
  cursorApplier: CursorApplier
  textApplier: TextApplier

  constructor() {
    (this: IApplier<TextOperation, DocumentState>)
    this.cursorApplier = new CursorApplier() // no DI :()
    this.textApplier = new TextApplier()
  }
  initial(): DocumentState {
    return { cursor: this.cursorApplier.initial(), text: this.textApplier.initial() }
  }
  stateHash(state: DocumentState): string {
    return this.textApplier.stateHash(state.text)
  }
  applyNullable(s: DocumentState, ops: ?TextOperation[]): DocumentState {
    if (ops == null) {
      return s
    }
    return this.apply(s, ops)
  }
  apply(state: DocumentState, ops: TextOperation[]): DocumentState {
    return {
      cursor: this.cursorApplier.apply(state.cursor, ops),
      text: this.textApplier.apply(state.text, ops)
    }
  }
}
