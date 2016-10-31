/* @flow */

import { inferOperations } from './ot/operations.js'

$(document).ready(() => {
  let $textarea = $('#local-text')
  let textarea = $textarea[0]

  let text = ''
  let cursorStart = 0
  let cursorEnd = 0

  $textarea.on('input selectionchange propertychange', () => {
    let newText = $textarea.val()
    let newCursorStart = $textarea.prop("selectionStart")
    let newCursorEnd = $textarea.prop("selectionEnd")

    let ops = inferOperations(text, newText)
    console.log(ops)
    text = newText
  })
})
