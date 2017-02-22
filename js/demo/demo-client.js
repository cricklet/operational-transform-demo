/* @flow */

import type { DocumentState } from '../ot/applier.js'
import { DocumentApplier } from '../ot/applier.js'

import * as Inferrer from '../ot/inferrer.js'
import * as Transformer from '../ot/transformer.js'

import { OTClientHelper } from '../controllers/ot_client_helper.js'
import { OTHelper } from '../controllers/ot_helper.js'

import { observeObject } from '../helpers/observe'

import type { ClientConnection } from '../network/websockets_client_connection.js'
import { setupClientConnection } from '../network/websockets_client_connection.js'

function updateUI ($text, state) {
  $text.val(state.text)
  $text.prop("selectionStart", state.cursor.start),
  $text.prop("selectionEnd", state.cursor.end)
}

function getUIState($text): [string, number, number] {
  return [
    $text.val(),
    $text.prop("selectionStart"),
    $text.prop("selectionEnd")
  ]
}

$(document).ready(() => {
  let $text = $('#editor')

  let docId = location.hash || 'default'

  let client = new OTClientHelper(docId, new OTHelper(DocumentApplier))
  let clientConnection: ClientConnection = setupClientConnection(
    'http://localhost:8123',
    docId,
    client,
    console.log)

  $('#undo').click(() => {
    let update = client.performUndo()
    if (update != null) {
      clientConnection.update(update)
    }
  })

  $('#redo').click(() => {
    let update = client.performRedo()
    if (update != null) {
      clientConnection.update(update)
    }
  })

  observeObject(client,
    (_, key) => {}, // added
    (_, key) => {}, // deleted
    (_, key) => {// changed
      updateUI($text, client.state)
    }
  )
  $text.on('keyup mousedown mouseup', () => {
    let [newText, newCursorStart, newCursorEnd] = getUIState($text)

    // handle new cursor
    client.state.cursor.start = newCursorStart
    client.state.cursor.end = newCursorEnd

    updateUI($text, client.state)
  })
  $text.on('input propertychange change onpaste', () => {
    let [newText, newCursorStart, newCursorEnd] = getUIState($text)

    // handle new text
    let editOps = Inferrer.inferOperation(client.state.text, newText)
    if (editOps != null) {
      let update = client.performEdit(editOps)
      if (update != null) {
        clientConnection.update(update)
      }
    }

    // handle new cursor
    client.state.cursor.start = newCursorStart
    client.state.cursor.end = newCursorEnd

    updateUI($text, client.state)
  })
})
