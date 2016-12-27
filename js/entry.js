/* @flow */

import { Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray, asyncWait, insert, allEqual, remove } from './ot/utils.js'
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
  propogate: (clientRequest: ?ClientRequest<*>) => Promise<void>,
  $text: any,
  delay: { minDelay: number, maxDelay: number }
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
    let op = inferrer.inferOps(client.state.text, newText)
    if (op != null) {
      let request = orchestrator.clientLocalOperation(client, op)
      setTimeout(() => propogate(request), delay.minDelay + (delay.maxDelay - delay.minDelay) * Math.random())
    }

    // handle new cursor
    client.state.cursor.start = newCursorStart
    client.state.cursor.end = newCursorEnd

    update()
  })
}

function createServerDOM() {
  let $server = $(`<div class="computer">
    <textarea readonly class="text" rows="4" cols="50"></textarea>
    <div><input type="number" class="minDelay" value="500"> ms - <input type="number" class="maxDelay" value="1000"> ms delay</div>
    <br/>
  </div>`)

  let $text = $server.find('.text')
  let $minDelay = $server.find('.minDelay')
  let $maxDelay = $server.find('.maxDelay')

  let delay = createBoundObject(
    { minDelay: () => parseInt($minDelay.val()), maxDelay: () => parseInt($maxDelay.val()) },
    { minDelay: (v) => $minDelay.val(v),         maxDelay: (v) => $maxDelay.val(v) },
    { minDelay: (f) => $minDelay.change(f),      maxDelay: (f) => $maxDelay.change(f) },
    obj => obj.minDelay <= obj.maxDelay
  )
  return [$server, $text, delay]
}


function createClientDOM(insertChecked, deleteChecked) {
  insertChecked = insertChecked ? 'checked' : ''
  deleteChecked = deleteChecked ? 'checked' : ''

  let $client = $(`<div class="computer">
  	<textarea class="text" rows="4" cols="50"></textarea>
  	<div><input type="number" class="minDelay" value="500"> - <input type="number" class="maxDelay" value="1000"> ms delay</div>
  	<div><input type="checkbox" ${insertChecked} class="randomWords"> insert every <input type="number" class="randomWordsDelay" value="2000"> ms</div>
  	<div><input type="checkbox" ${deleteChecked} class="randomDeletes"> delete every <input type="number" class="randomDeletesDelay" value="4000"> ms</div>
  	<br/>
  </div>`)
  let $text = $client.find('.text')
  let $minDelay = $client.find('.minDelay')
  let $maxDelay = $client.find('.maxDelay')
  let $randomWords = $client.find('.randomWords')
  let $randomWordsDelay = $client.find('.randomWordsDelay')
  let $randomDeletes = $client.find('.randomDeletes')
  let $randomDeletesDelay = $client.find('.randomDeletesDelay')

  let delay = createBoundObject(
    { minDelay: () => parseInt($minDelay.val()), maxDelay: () => parseInt($maxDelay.val()) },
    { minDelay: (v) => $minDelay.val(v),         maxDelay: (v) => $maxDelay.val(v) },
    { minDelay: (f) => $minDelay.change(f),      maxDelay: (f) => $maxDelay.change(f) },
    (obj) => obj.minDelay <= obj.maxDelay
  )
  let shouldInsert = createBoundObject(
    { enabled: () => $randomWords[0].checked,          delay: () => parseInt($randomWordsDelay.val()) },
    { enabled: (v) => $randomWords.prop('checked', v), delay: (v) => $randomWordsDelay.val(v) },
    { enabled: (f) => $randomWords.change(f),          delay: (f) => $randomWordsDelay.change(f) },
  )
  let shouldDelete = createBoundObject(
    { enabled: () => $randomDeletes[0].checked,          delay: () => parseInt($randomDeletesDelay.val()) },
    { enabled: (v) => $randomDeletes.prop('checked', v), delay: (v) => $randomDeletesDelay.val(v) },
    { enabled: (f) => $randomDeletes.change(f),          delay: (f) => $randomDeletesDelay.change(f) },
  )

  return [ $client, $text, delay, shouldInsert, shouldDelete ]
}

function createBoundObject(
  getters: {[prop: string]: (() => any)},
  setters: {[prop: string]: ((v: any) => void)},
  listeners: {[prop: string]: (callback: () => void) => void},
  validate?: (o: {[prop: string]: any}) => boolean
): {[prop: string]: any} {

  // I wish I knew how to type-check this s.t. all objects are guarunteed to
  // have the same keys :O

  let props = Object.keys(getters)
  let prev = {}
  let obj = {}

  for (let prop of props) {
    let getter = getters[prop]
    let setter = setters[prop]
    let listener = listeners[prop]

    obj[prop] = getter()
    prev[prop] = obj[prop]
    listener(() => {
      obj[prop] = getter()

      if (validate === undefined || validate(obj)) {
        // whoops
        prev[prop] = obj[prop]
      } else {
        // revert!
        setter(prev[prop])
        obj[prop] = prev[prop]
      }
    })
  }

  return obj
}

let WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing",
  "elit", "nullam", "sit", "amet", "nulla", "non", "est", "finibus",
  "mollis", "nulla", "in", "felis", "eu", "felis", "vehicula", "viverra",
  "id", "lobortis", "massa", "aliquam", "mi", "dolor", "aliquet", "a",
  "volutpat", "vitae", "porta", "tempor", "eros", "vestibulum", "sit",
  "amet", "commodo", "ex", "vestibulum", "ante", "ipsum", "primis", "in",
  "faucibus", "orci", "luctus", "et", "ultrices", "posuere", "cubilia", "curae",
  "in", "dapibus", "sollicitudin", "est", "vel", "convallis", "class", "aptent",
  "taciti", "sociosqu", "ad", "litora", "torquent", "per", "conubia", "nostra",
  "per", "inceptos", "himenaeos"
]

function pickRandom<T>(arr: T[]): T {
  let i = Math.floor(Math.random() * arr.length)
  return arr[i]
}

function addWord(text) {
  let words = text.split(' ')
  let word = pickRandom(WORDS)
  let i = Math.floor(Math.random() * words.length)
  return insert(words, word, i).join(' ')
}

function deletePortion(text) {
  let words = text.split(' ')
  let i = Math.floor(Math.random() * words.length)
  return remove(words, i).join(' ')
}

function randomlyAdjustText(
  $text,
  shouldInsert: {enabled: boolean, delay: number},
  shouldDelete: {enabled: boolean, delay: number}
) {
  (async () => {
    while (true) {
      if (shouldInsert.enabled) {
        $text.val(addWord($text.val()))
        $text.trigger("change")
        await asyncWait(shouldInsert.delay)
      } else {
        await asyncWait(1000)
      }
    }
  }) ();

  (async () => {
    while (true) {
      if (shouldDelete.enabled) {
        $text.val(deletePortion($text.val()))
        $text.trigger("change")
        await asyncWait(shouldDelete.delay)
      } else {
        await asyncWait(1000)
      }
    }
  }) ();
}

$(document).ready(() => {
  // stuff to dependency inject
  let transformer = new SuboperationsTransformer(retainFactory)
  let applier = new TextApplier()
  let inferrer = new SimpleTextInferrer()
  let orchestrator = new Orchestrator(transformer, applier)

  // client containers
  let $clientsContainer = $('#clients-container')
  let $texts = []
  let clients: Client<*,*>[] = []

  // server
  let $serverContainer = $('#server-container')
  let [$server, $serverText, serverDelay] = createServerDOM()
  $serverContainer.append($server)

  let server = generateServer({cursor: {start: 0, end: 0}, text: ''})
  observeObject(server,
    (_, key) => {// added
    },
    (_, key) => {// deleted
    },
    (_, key) => {// changed
      $serverText.val(server.state.text)
    },
  )

  // propogator between server & clients
  let propogator = generateAsyncPropogator(orchestrator, server, clients, () => {}, serverDelay)

  for (let i = 0; i < 3; i ++) {
    let [$client, $text, delay, shouldInsert, shouldDelete] = createClientDOM(i === 0, false)
    $clientsContainer.append($client)

    let client = generateClient({cursor: {start: 0, end: 0}, text: ''})
    setupClient(applier, inferrer, orchestrator, client, propogator, $text, delay)
    randomlyAdjustText($text, shouldInsert, shouldDelete)

    clients.push(client)
    $texts.push($text)
  }

  let $ellipses = $('.ellipses');

  (async () => {
    while (true) {
      await asyncWait(400)
      $ellipses.text('.')
      await asyncWait(400)
      $ellipses.text('..')
      await asyncWait(400)
      $ellipses.text('...')
    }
  }) ();

  let $converging = $('.converging')
  let $converged = $('.converged')

  $converging.hide()
  $converged.show();

  (async () => {
    while (true) {
      await asyncWait(500)
      if (allEqual($texts.map($t => $t.val()))) {
        $converging.hide()
        $converged.show()
      } else {
        $converging.show()
        $converged.hide()
      }
    }
  }) ();
})
