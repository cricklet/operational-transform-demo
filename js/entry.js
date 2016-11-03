/* @flow */

import { push } from './ot/utils.js'
import { inferOperations, performTextOperation } from './ot/operations.js'
import type { TextOperation } from './ot/operations.js'
import { generateSite, generateState, generatePriority, updateStateWithOperation } from './ot/sites.js'
import type { Site, SiteState, Log, Requests, Request, LogEntry } from './ot/sites.js'
import { zip } from 'wu'
import { observeArray } from './ot/observe'

type Lock = { ignoreEvents: boolean }

function generateLock(): Lock {
  return { ignoreEvents: false }
}

function textValues($text): [string, number, number] {
  return [
    $text.val(),
    $text.prop("selectionStart"),
    $text.prop("selectionEnd")
  ]
}

function setText($text, client: { text: string, cursorStart: number, cursorEnd: number }): void {
  $text.val(client.text),
  $text.prop(client.cursorStart),
  $text.prop(client.cursorEnd)
}

export function listenForLocalOperations($text: any, emit: (o: TextOperation) => void, lock: Lock) {
  let [text, cursorStart, cursorEnd] = textValues($text)

  $text.on('input selectionchange propertychange', () => {
    if (lock.ignoreEvents) { return }

    let [newText, newCursorStart, newCursorEnd] = textValues($text)

    let ops = inferOperations(text, newText)
    for (let op: TextOperation of ops) {
      emit(op)
    }

    text = newText
    cursorStart = newCursorStart
    cursorEnd = newCursorEnd
  })
}

export function applyLocalOperation(client: Client, op: TextOperation)
: [
  {
    state: SiteState,
    log: Log,
    text: string
  },
  Request
] {
  let priority = generatePriority(op, client.site, client.log)

  let logEntry: LogEntry = {
    kind: 'LogEntry',
    sourceSite: client.site,
    sourceState: client.state,
    localOperation: op,
    localState: client.state,
    priority: priority
  }

  let request: Request = {
    kind: 'Request',
    sourceSite: client.site,
    sourceOperation: op,
    sourceState: client.state,
    priority: priority
  }

  return [
    {
      state: updateStateWithOperation(client.state, client.site),
      log: push(client.log, logEntry),
      text: performTextOperation(client.text, op),
    },
    request
  ]
}

type Client = {
  kind: 'Client',
  site: Site,
  state: SiteState,
  log: Log,
  text: string,
  cursorStart: number,
  cursorEnd: number
}

function generateClient(): Client {
  return {
    kind: 'Client',
    site: generateSite(),
    state: generateState(),
    log: [],
    text: '',
    cursorStart: 0,
    cursorEnd: 0
  }
}

function setupClient(
  client: Client,
  $text: any,
  incomingRequests: Array<Request>,
  emitRequest: (r: Request) => ?any
) {
  let lock = generateLock()

  let onLocalTextOperation = (op: TextOperation) => {
    let [dClient, newRequest] = applyLocalOperation(client, op)

    // update the client
    client = Object.assign({}, client, dClient)

    // update the dom
    lock.ignoreEvents = true
    setText($text, client)
    lock.ignoreEvents = false

    // inform listeners
    emitRequest(newRequest)
  }

  let onRequestsUpdated = (_) => {
    console.log(incomingRequests)
  }

  observeArray(incomingRequests, onRequestsUpdated, (_) => {})
  listenForLocalOperations($text, onLocalTextOperation, lock)
}

$(document).ready(() => {
  let localClient = generateClient()
  let $localText = $('#local-text')
  let localRequests = []

  let remoteClient = generateClient()
  let $remoteText = $('#delay-text')
  let remoteRequests = []

  setupClient(localClient, $localText, localRequests,
    r => remoteRequests.push(r))

  setupClient(remoteClient, $remoteText, remoteRequests,
    r => setTimeout(() => localRequests.push(r), Math.random() * 3000))
})
