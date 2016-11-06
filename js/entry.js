/* @flow */

import { transform } from './ot/transforms.js'
import { inferOperations, performTextOperation } from './ot/operations.js'
import type { TextOperation } from './ot/operations.js'
import { Less, Greater, Equal, reverse, push, findIndex } from './ot/utils.js'
import { generateSite, generateState, generatePriority, updateStateWithOperation, stateComparitor, priorityComparitor } from './ot/sites.js'
import type { Site, SiteState, Log, Requests, Request, LogEntry, Priority } from './ot/sites.js'
import { count, zip, filter, find, takeWhile, take } from 'wu'
import { observeArray } from './ot/observe'

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

function updateDOMTextbox($text, client: { text: string, cursorStart: number, cursorEnd: number }): void {
  $text.val(client.text),
  $text.prop("selectionStart", client.cursorStart),
  $text.prop("selectionEnd", client.cursorEnd)
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

export function applyOperationToClient(
  op: TextOperation,
  sourceSite: Site,
  sourceState: SiteState,
  priority: Priority,
  client: Client
): Client {
  let newClient = Object.assign({}, client, {
    text:        op.kind === 'InsertOperation' || op.kind === 'DeleteOperation'
                 ? performTextOperation(client.text, op) : client.text,

    state:       updateStateWithOperation(sourceState, sourceSite),

    log:         push(client.log, {
                    kind: 'LogEntry',
                    sourceSite: sourceSite,
                    sourceState: sourceState,
                    localOperation: op,
                    localState: client.state,
                    priority: priority })
  })

  return newClient
}

export function generateRequest(op: TextOperation, priority: Priority, client: Client): Request {
  return {
    kind: 'Request',
    sourceSite: client.site,
    sourceOperation: op,
    sourceState: client.state,
    priority: priority
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
    let priority = generatePriority(op, client.site, client.log)
    emitRequest(generateRequest(op, priority, client))
    client = applyOperationToClient(op, client.site, client.state, priority, client)

    // update the dom
    lock.ignoreEvents = true
    updateDOMTextbox($text, client)
    lock.ignoreEvents = false
  }

  let onRequestsUpdated = (_) => {
    while (true) {
      // for each request: (site: j, state: s[j], operation oj, priority p[oj])
      // in requests[i] where s[j] <= s[i]
      let requestFilter = (r: Request) => stateComparitor(r.sourceState, client.state) <= Equal
      let requestIndex: ?number = findIndex(requestFilter, incomingRequests)
      if (requestIndex == undefined) { break }

      // pop request off of requests[i]
      let request: Request = incomingRequests[requestIndex]
      incomingRequests.splice(requestIndex, 1)

      let requestedOperation = request.sourceOperation
      let requestedPriority = request.priority
      let requestingSite = request.sourceSite
      let requestingState = request.sourceState

      // if state s[j] < s[i]
      // i.e. there are ops on the client that the request needs to be transformed against
      if (stateComparitor(requestingState, client.state) < Equal) {
        // get the most recent log entry (site: k, state: s[k], operation ok, priority p[ok])
        // where s[k] <= s[j]
        // i.e. the log entry has fewer/equal operations executed as the request
        let numRecentLogs = count(
          takeWhile((l: LogEntry) => stateComparitor(l.sourceState, requestingState) <= Equal,
                    reverse(client.log)()))

        let recentLogs = take(numRecentLogs + 1, reverse(client.log)())
        for (let log: LogEntry of recentLogs) {
          // if the kth component of s[j] is <= the kth component of s[k]
          // i.e. the number of request state ops from the log site
          //      is less/equal to
          //      the number of log state ops from the log site
          let requestOps = requestingState[log.sourceSite] || 0
          let logOps = log.sourceState[log.sourceSite] || 0

          if (requestOps <= logOps) {
            let transformed: ?TextOperation = transform(
              requestedOperation,
              log.localOperation,
              priorityComparitor(requestedPriority, log.priority))

            requestedOperation = transformed || requestedOperation
          }
        }
      }

      console.log(requestedOperation)
      client = applyOperationToClient(requestedOperation, requestingSite, requestingState, requestedPriority, client)

      // update the dom
      lock.ignoreEvents = true
      updateDOMTextbox($text, client)
      lock.ignoreEvents = false
    }
  }

  observeArray(incomingRequests, onRequestsUpdated, (_) => {})

  $text.on('input selectionchange propertychange', () => {
    if (lock.ignoreEvents) { return }

    let [newText, newCursorStart, newCursorEnd] = getValuesFromDOMTextbox($text)

    let ops = inferOperations(client.text, newText)
    for (let op: TextOperation of ops) {
      onLocalTextOperation(op)
    }

    client.cursorStart = newCursorStart
    client.cursorEnd = newCursorEnd
  })
}

$(document).ready(() => {
  let $text0 = $('#text0')
  let requests0 = []

  let $text1 = $('#text1')
  let requests1 = []

  let $text2 = $('#text2')
  let requests2 = []

  setupClient(generateClient(), $text0, requests0,
    r => setTimeout(() => { requests1.push(r); requests2.push(r) }, Math.random() * 500))
  setupClient(generateClient(), $text1, requests1,
    r => setTimeout(() => { requests0.push(r); requests2.push(r) }, Math.random() * 1000 + 1000))
  setupClient(generateClient(), $text2, requests2,
    r => setTimeout(() => { requests0.push(r); requests1.push(r) }, Math.random() * 2000 + 2000))
})
