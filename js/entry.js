/* @flow */

import { Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray } from './ot/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'
import { observeArray, observeObject } from './ot/observe'

import type {
  Client,
  Server,
  ClientRequest,
  ServerRequest
} from './ot/orchestrator.js'

import type {
  IApplier,
  IInferrer,
  ITransformer
} from './ot/operations.js'

import type {
  SimpleTextOperation,
  TextState
} from './ot/text_operations.js'

import {
  generateAsyncPropogator,
  generateClient,
  generateServer,
  Orchestrator
} from './ot/orchestrator.js'

import {
  retainFactory,
  SuboperationsTransformer,
  TextApplier,
  SimpleTextInferrer,
} from './ot/text_operations.js'

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

function updateDOMTextbox($text, state: TextState): void {
  // cursorStart: number, cursorEnd: number
  $text.val(state.text)
  $text.prop("selectionStart", state.cursor.start),
  $text.prop("selectionEnd", state.cursor.end)
}

function setupClient(
  applier: IApplier<*,*>,
  inferrer: IInferrer<*,*>,
  orchestrator: Orchestrator<*,*>,
  client: Client<*,*>,
  propogate: (clientRequest: ?ClientRequest<*>) => void,
  $text: any,
  delay: number
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

  $text.on('input selectionchange propertychange', () => {
    if (lock.ignoreEvents) { return }

    let [newText, newCursorStart, newCursorEnd] = getValuesFromDOMTextbox($text)

    // handle new text
    let op = inferrer.inferOps(client.state.text, newText)
    if (op != null) {
      let request = orchestrator.clientLocalOperation(client, op)
      setTimeout(() => propogate(request), delay + delay * Math.random())
    }

    // handle new cursor
    client.state.cursor.start = newCursorStart
    client.state.cursor.end = newCursorEnd

    update()
  })
}

$(document).ready(() => {
  let transformer = new SuboperationsTransformer(retainFactory)
  let applier = new TextApplier()
  let inferrer = new SimpleTextInferrer()
  let orchestrator = new Orchestrator(transformer, applier)

  let $text0 = $('#text0')
  let requests0 = []
  let client0 = generateClient({cursor: {start: 0, end: 0}, text: ''})

  let $text1 = $('#text1')
  let requests1 = []
  let client1 = generateClient({cursor: {start: 0, end: 0}, text: ''})

  let $text2 = $('#text2')
  let requests2 = []
  let client2 = generateClient({cursor: {start: 0, end: 0}, text: ''})

  let server = generateServer({cursor: {start: 0, end: 0}, text: ''})

  let propogate = generateAsyncPropogator(orchestrator, server, [client0, client1, client2], () => {})

  setupClient(applier, inferrer, orchestrator, client0, propogate, $text0, 500)
  setupClient(applier, inferrer, orchestrator, client1, propogate, $text1, 1000)
  setupClient(applier, inferrer, orchestrator, client2, propogate, $text2, 2000)
})
