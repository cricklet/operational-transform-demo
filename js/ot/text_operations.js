/* @flow */

import { hash, clone, assign, genUid, rearray, repeat, calculatePostfixLength, removeTail, calculatePrefixLength, substring, restring } from './utils.js'
import { map } from 'wu'
import { ITransformer, IApplier } from './operations.js'


//

type SuboperationKind = 'Delete'|'Insert'|'Placeholder'|'Retain'

interface ISubOperation {
  kind(): SuboperationKind,
  length(): number,
  split(pos: number): [ISubOperation, ISubOperation]
}

//

export function generateInsert(pos: number, text: string): ISubOperation[] {
  return [
    new Retain(pos), new InsertText(text)
  ]
}

export function generateDelete(pos: number, n: number): ISubOperation[] {
  return [
    new Retain(pos), new Delete(n)
  ]
}

class InsertText {
  text: string

  constructor(text: string) {
    (this: ISubOperation)
    this.text = text
  }
  toString(): string {
    return `insert "${this.text}"`
  }
  kind(): SuboperationKind {
    return 'Insert'
  }
  split (offset: number): [ISubOperation, ISubOperation] {
    if (offset < 0 || offset > this.text.length) {
      throw new Error()
    }
    return [
      new InsertText(this.text.substring(0, offset)),
      new InsertText(this.text.substring(offset))
    ]
  }
  length(): number {
    return this.text.length
  }
}

class Delete {
  num: number

  constructor(num: number) {
    (this: ISubOperation)
    this.num = num
  }
  toString(): string {
    return `delete #${this.num}`
  }
  kind(): SuboperationKind {
    return 'Delete'
  }
  split (offset: number): [ISubOperation, ISubOperation] {
    if (offset < 0 || offset > this.num) {
      throw new Error()
    }
    return [
      new Delete(offset),
      new Delete(this.num - offset)
    ]
  }
  length(): number {
    return this.num
  }
}

class Retain {
  num: number

  constructor(num: number) {
    (this: ISubOperation)
    this.num = num
  }
  toString(): string {
    return `retain #${this.num}`
  }
  kind(): SuboperationKind {
    return 'Retain'
  }
  split (offset: number): [ISubOperation, ISubOperation] {
    if (offset < 0 || offset > this.num) {
      throw new Error()
    }
    return [
      new Retain(offset),
      new Retain(this.num - offset)
    ]
  }
  length(): number {
    return this.num
  }
}

class Placeholder {
  constructor() {
    (this: ISubOperation)
  }
  toString(): string {
    return 'placeholder'
  }
  kind(): SuboperationKind {
    return 'Placeholder'
  }
  split (offset: number): [ISubOperation, ISubOperation] {
    throw new Error('wat')
  }
  length(): number {
    return 0
  }
}

class CursorStart {
  owner: string

  constructor(owner: string) {
    (this: ISubOperation)
    this.owner = owner
  }
  toString(): string {
    return 'placeholder'
  }
  kind(): SuboperationKind {
    return 'Placeholder'
  }
  split (offset: number): [ISubOperation, ISubOperation] {
    throw new Error('wat')
  }
  length(): number {
    return 0
  }
}

class CursorEnd {
  owner: string

  constructor(owner: string) {
    (this: ISubOperation)
    this.owner = owner
  }
  toString(): string {
    return 'placeholder'
  }
  kind(): SuboperationKind {
    return 'Placeholder'
  }
  split (offset: number): [ISubOperation, ISubOperation] {
    throw new Error('wat')
  }
  length(): number {
    return 0
  }
}

//

function composeConsumeOps(a: ?ISubOperation, b: ?ISubOperation)
: [?ISubOperation, [?ISubOperation, ?ISubOperation]] {
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

function transformConsumeOps(a: ?ISubOperation, b: ?ISubOperation)
: [[?ISubOperation, ?ISubOperation], [?ISubOperation, ?ISubOperation]] {
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

export class SuboperationsTransformer {
  constructor() {
    (this: ITransformer<ISubOperation[]>)
  }
  transformNullable(clientOps: ?ISubOperation[], serverOps: ?ISubOperation[])
  : [?ISubOperation[], ?ISubOperation[]] {
    if (clientOps != null && serverOps != null) {
      let [newClientOps, newServerOps] = this.transform(clientOps, serverOps)
      return [newClientOps, newServerOps]
    } else {
      return [clientOps, serverOps]
    }
  }
  transform(clientOps: ISubOperation[], serverOps: ISubOperation[])
  : [ISubOperation[], ISubOperation[]] {
    let ops1 = clientOps
    let ops2 = serverOps

    let ops1P = []
    let ops2P = []

    let i1 = 0
    let i2 = 0

    let op1: ?ISubOperation = undefined
    let op2: ?ISubOperation = undefined

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

      let [[op1P, op2P], [newOp1, newOp2]] = transformConsumeOps(op1, op2)

      if (op1P != null) { ops1P.push(op1P) }
      if (op2P != null) { ops2P.push(op2P) }

      [op1, op2] = [newOp1, newOp2]
    }

    return [ops1P, ops2P]
  }
  composeNullable (ops1: ?ISubOperation[], ops2: ?ISubOperation[])
  : ?ISubOperation[] {
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
  compose(ops1: ISubOperation[], ops2: ISubOperation[])
  : ISubOperation[] {
    // compose (ops1, ops2) to composed s.t.
    // apply(apply(text, ops1), ops2) === apply(text, composed)

    // code borrowed from https://github.com/Operational-Transformation/ot.py/blob/master/ot/text_operation.py#L219

    let composed = []

    let i1 = 0
    let i2 = 0

    let op1: ?ISubOperation = undefined
    let op2: ?ISubOperation = undefined

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

      let [composedOp, [newOp1, newOp2]] = composeConsumeOps(op1, op2)

      if (composedOp != null) { composed.push(composedOp) }
      [op1, op2] = [newOp1, newOp2]
    }

    return composed
  }
  composeMany(ops: Iterable<ISubOperation[]>)
  : ISubOperation[] {
    let composed: ISubOperation[] = []
    for (let op of ops) {
      composed = this.compose(composed, op)
    }
    return composed
  }
}

//

type SimpleTextSubops = InsertText | Delete | Retain | Placeholder
type SimpleTextState = string

type SimpleTextOperation = SimpleTextSubops[]

export class SimpleTextApplier {
  constructor() {
    (this: IApplier<SimpleTextOperation, SimpleTextState>)
  }
  stateString(text: SimpleTextState): string {
    return text
  }
  apply(text: SimpleTextState, op: SimpleTextOperation): SimpleTextState {
    let i = 0
    for (let subop of op) {
      if (subop instanceof InsertText) {
        text = text.slice(0, i) + subop.text + text.slice(i)
        i += subop.text.length
      }

      if (subop instanceof Retain) {
        if (subop.num < 0) { throw new Error('wat, failed to retain') }
        i += subop.num
      }

      if (subop instanceof Delete) {
        if (subop.num < 0) { throw new Error('wat, failed to delete') }
        if (i + subop.num > text.length) { throw new Error('wat, trying to delete too much') }
        text = text.slice(0, i) + text.slice(i + subop.num)
      }

      // make sure we didn't accidentally overshoot
      if (i > text.length) { throw new Error('wat, overshot') }
    }

    return text
  }
  inferOs(oldText: SimpleTextState, newText: SimpleTextState): ?SimpleTextOperation {
    if (oldText.length === newText.length) {
      // we have a no-op
      if (oldText === newText) {
        return undefined;
      }
    }

    if (newText.length === 0) {
      return [new Delete(oldText.length)]
    }

    if (oldText.length === 0) {
      return [new InsertText(newText)]
    }

    // or we have a selection being overwritten. this is well tested!
    let postfixLength = calculatePostfixLength(oldText, newText)
    let newTextLeftover = removeTail(newText, postfixLength)
    let oldTextLeftover = removeTail(oldText, postfixLength)
    let prefixLength = calculatePrefixLength(oldTextLeftover, newTextLeftover)

    let start = prefixLength
    let endOld = oldText.length - postfixLength
    let endNew = newText.length - postfixLength

    return [
      new Retain(start),
      new Delete(endOld - start),
      new InsertText(restring(substring(newText, {start: start, stop: endNew})))
    ]
  }
}
