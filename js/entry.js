/* @flow */

import { push } from './ot/utils.js'
import { inferOperations, performOperations } from './ot/operations.js'
import { generateSite, generateState, generatePriority, updateStateWithOperation } from './ot/sites.js'
import type { Site, SiteState, Log, Requests } from './ot/sites.js'
import { zip } from 'wu'


function wireTextBox($text, initialText) {
  let text = initialText;

  let site: Site = generateSite()
  let state: SiteState = generateState()
  let log: Log = []
  let requests: Requests = []

  $text.on('input selectionchange propertychange', () => {
    let newText = $text.val()
    let newCursorStart = $text.prop("selectionStart")
    let newCursorEnd = $text.prop("selectionEnd")

    // let cursorStart = 0
    // let cursorEnd = 0

    let ops = inferOperations(text, newText)
    let priorities = ops.map(op => generatePriority(op, site, log))

    // update state & log
    for (let [op: TextOperation, priority: Priority] of zip(ops, priorities)) {
      let logEntry = {
        kind: 'LogEntry',
        sourceSite: site,
        sourceState: state,
        localOperation: op,
        localState: state,
        priority: priority
      }

      state = updateStateWithOperation(state, site)
      log = push(log, logEntry)
    }

    text = performOperations(text, ops)

    if (text !== newText) {
      debugger;
    }
  })
}

$(document).ready(() => {
  let $localText = $('#local-text')
  let $shortDelayText = $('#short-delay-text')
  let $longDelayText = $('#long-delay-text')

  wireTextBox($localText, '')
  wireTextBox($shortDelayText, '')
  wireTextBox($longDelayText, '')
})
