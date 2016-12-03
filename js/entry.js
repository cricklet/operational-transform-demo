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
  ITransformer
} from './ot/operations.js'

import type {
  SimpleTextOperation,
  SimpleTextState
} from './ot/text_operations.js'

import {
  generateAsyncPropogator,
  Orchestrator
} from './ot/orchestrator.js'

import {
  retainFactory,
  SuboperationsTransformer,
  SimpleTextApplier
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

function updateDOMTextbox($text, client: { state: string }): void {
  // cursorStart: number, cursorEnd: number
  $text.val(client.state)
  // $text.prop("selectionStart", client.cursorStart),
  // $text.prop("selectionEnd", client.cursorEnd)
}

function setupClient(
  applier: IApplier<*,*>,
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
    updateDOMTextbox($text, client)
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

    let op = applier.inferOs(client.state, newText)
    if (op != null) {
      let request = orchestrator.clientLocalOperation(client, op)
      setTimeout(() => propogate(request), delay + delay * Math.random())
    }

    update()
  })
}

$(document).ready(() => {
  let transformer = new SuboperationsTransformer(retainFactory)
  let applier = new SimpleTextApplier()
  let orchestrator = new Orchestrator(transformer, applier)

  let $text0 = $('#text0')
  let requests0 = []
  let client0 = orchestrator.generateClient('')

  let $text1 = $('#text1')
  let requests1 = []
  let client1 = orchestrator.generateClient('')

  let $text2 = $('#text2')
  let requests2 = []
  let client2 = orchestrator.generateClient('')

  let server = orchestrator.generateServer('')

  let propogate = generateAsyncPropogator(orchestrator, server, [client0, client1, client2], () => {})

  setupClient(applier, orchestrator, client0, propogate, $text0, 500)
  setupClient(applier, orchestrator, client1, propogate, $text1, 1000)
  setupClient(applier, orchestrator, client2, propogate, $text2, 2000)
})
