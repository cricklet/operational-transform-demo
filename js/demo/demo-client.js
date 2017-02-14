/* @flow */

import SockJS from 'sockjs-client'

import { merge, Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray, asyncWait, insert, allEqual, remove } from '../ot/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'
import { observeArray, observeObject } from '../ot/observe'

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

import { OTClient, OTServer } from '../ot/orchestrator.js'
import type { ClientUpdate, ServerBroadcast } from '../ot/orchestrator.js'

import { SimulatedRouter } from '../ot/router.js'
import type { IRouter } from '../ot/router.js'

let WS_HOST = 'localhost'
let WS_PORT = 8001
let WS_URL = `http://${WS_HOST}:${WS_PORT}`

var echo = new SockJS(`${WS_URL}/echo`);

echo.onopen = function() {
  console.log('connection opened');
  echo.send('test');
};
echo.onmessage = function(e) {
  console.log('received:', e.data);
};
echo.onclose = function() {
  console.log('connection closed');
};

type Lock = { ignoreEvents: boolean }

function generateLock(): Lock {
  return { ignoreEvents: false }
}

function getValuesFromDOMTextbox($text): [string, number, number] {
  return [
    $text.val(),
    $text.prop("selectionStart"),
    $text.prop("selectionEnd")
  ]
}

function updateDOMTextbox($text, state: DocumentState): void {
  // cursorStart: number, cursorEnd: number
  $text.val(state.text)
  $text.prop("selectionStart", state.cursor.start),
  $text.prop("selectionEnd", state.cursor.end)
}

function setupClient(
  applier: IApplier<*,*>,
  inferrer: IInferrer<*,*>,
  client: OTClient<*,*>,
  router: IRouter<*,*>,
  $text: any,
) {
  let lock = generateLock()

  let update = () => {
    // update the dom
    lock.ignoreEvents = true
    updateDOMTextbox($text, client.state)
    lock.ignoreEvents = false
  }

  observeObject(client,
    (_, key) => {// added
    },
    (_, key) => {// deleted
    },
    (_, key) => {// changed
      update()
    },
  )

  $text.on('keyup mousedown mouseup', () => {
    let [newText, newCursorStart, newCursorEnd] = getValuesFromDOMTextbox($text)

    // handle new cursor
    client.state.cursor.start = newCursorStart
    client.state.cursor.end = newCursorEnd

    update()
  })
  $text.on('input propertychange change onpaste', () => {
    if (lock.ignoreEvents) { return }

    let [newText, newCursorStart, newCursorEnd] = getValuesFromDOMTextbox($text)

    // handle new text
    let editOps = inferrer.infer(client.state.text, newText)
    if (editOps != null) {
      let update = client.handleEdit(editOps)
      if (update != null) {
        router.send(update)
      }
    }

    // handle new cursor
    client.state.cursor.start = newCursorStart
    client.state.cursor.end = newCursorEnd

    update()
  })
}

// $(document).ready(() => {
//   let operator = new Operator()
//   let applier = new DocumentApplier()
//   let inferrer = new TextInferrer()
//
//   let client = new OTClient(operator, applier)
//   let clientRouter = new SimulatedRouter((broadcast: ServerBroadcast<*>) => {
//     let update = client.handleBroadcast(broadcast)
//     if (update == null) { return }
//     clientRouter.send(update)
//   }, chaos)
//
//   let $text = $("#editor")
//   setupClient(
//     applier,
//     inferrer,
//     client,
//     router,
//     $text)
// })
