/* @flow */

import { push } from './ot/utils.js'
import { inferOperations, performOperations } from './ot/operations.js'
import { generateSite, generateState, generatePriority, updateStateWithOperation } from './ot/sites.js'
import type { Site, SiteState, Log } from './ot/sites.js'
import { zip } from 'wu'

$(document).ready(() => {
  let $textarea = $('#local-text')
  let textarea = $textarea[0]

  let localSite: Site = generateSite()
  let localState: SiteState = generateState()
  let localLog: Log = []

  let text = ''
  let cursorStart = 0
  let cursorEnd = 0

  $textarea.on('input selectionchange propertychange', () => {
    let newText = $textarea.val()
    let newCursorStart = $textarea.prop("selectionStart")
    let newCursorEnd = $textarea.prop("selectionEnd")

    let ops = inferOperations(text, newText)
    let priorities = ops.map(op => generatePriority(op, localSite, localLog))

    // update state & log
    for (let [op: TextOperation, priority: Priority] of zip(ops, priorities)) {
      let logEntry = {
        kind: 'LogEntry',
        sourceSite: localSite,
        sourceState: localState,
        localOperation: op,
        localState: localState,
        priority: priority
      }

      localState = updateStateWithOperation(localState, localSite)
      localLog = push(localLog, logEntry)
    }

    text = performOperations(text, ops)

    if (text !== newText) {
      debugger;
    }
  })
})
