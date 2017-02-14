/* @flow */

import { Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray, asyncWait, insert, allEqual, remove } from '../ot/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'
import { observeArray, observeObject } from '../ot/observe'

import * as CodeMirror from '../libs/codemirror.js'

import {
  OTClient,
  OTServer,
} from '../ot/new_orchestrator.js'

import type {
  ClientUpdate,
  ServerBroadcast,
} from '../ot/new_orchestrator.js'

import { SimulatedRouter } from '../ot/network_helper.js'

import type { IRouter } from '../ot/network_helper.js'

import type {
  IApplier,
  IInferrer,
  IOperator
} from '../ot/operations.js'

import type {
  DocumentState
} from '../ot/text_operations.js'

import {
  Operator,
  DocumentApplier,
  TextInferrer,
} from '../ot/text_operations.js'

import {
  merge
} from '../ot/utils.js'

// class CodeMirrorAdapter {
//   cm: CodeMirror
//
//   constructor (cm: CodeMirror) {
//     this.cm = cm
//   }
//
//   replaceText(start: number, end: number, text: string, origin: string) {
//     this.changeId_++
//     var newOrigin = RichTextOriginPrefix + this.changeId_
//     this.outstandingChanges_[newOrigin] = { origOrigin: origin }
//
//     var from = this.cm.posFromIndex(start);
//     var to = typeof end === 'number' ? this.cm.posFromIndex(end) : null;
//     this.cm.replaceRange(text, from, to, newOrigin);
//   };
//
//   insertText(index: number, text: string, origin: string): void {
//     var cursor = this.cm.getCursor()
//     var resetCursor = origin == 'RTCMADAPTER' && !this.cm.somethingSelected() && index == this.cm.indexFromPos(cursor);
//     this.replaceText(index, null, text, origin);
//     if (resetCursor) this.cm.setCursor(cursor);
//   }
// }

$(document).ready(() => {
  let cm = CodeMirror.fromTextArea(document.getElementById('codemirror'), {
    lineNumbers: true,
    mode: "htmlmixed"
  })

  // this.codeMirror.on('change', onChange)
  // this.codeMirror.on('beforeChange', beforeChange)
})
