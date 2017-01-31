/* @flow */

import { Less, Greater, Equal, genUid, reverse, push, findIndex, findLastIndex, subarray, asyncWait, insert, allEqual, remove } from './ot/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'
import { observeArray, observeObject } from './ot/observe'

import type {
  DocumentState,
  TextOperation
} from './ot/text_operations.js'

import {
  LinearOperator,
  DocumentApplier,
  TextInferrer,
} from './ot/text_operations.js'

import {
  Client,
  Server,
  ContextualOperator,
  NetworkSimulator
} from './ot/new_orchestrator.js'

function createBoundDelay($delay) {
  let delay: { minDelay: number, maxDelay: number } = createBoundObject(
    () => { // generate the delay object based on $delay's value
      return {
        minDelay: Math.max(0, parseInt($delay.val()) - 500),
        maxDelay: parseInt($delay.val())
      }
    },
    (f) => $delay.change(f), // update the delay object when $delay changes
    {
      validate: obj => (obj.minDelay <= obj.maxDelay), // if min delay doesn't make sense
      reset: obj => $delay.val(obj.maxDelay) // reset $delay to the previous value
    }
  )
  return delay
}

function createBoundObject(
  generate: () => Object,
  listener: (callback: () => void) => void,
  validator?: {
    validate: (o: Object) => boolean,
    reset: (o: Object) => void
  }
): Object {
  // This lil function generates an object who's values are automatically
  // updated & validated.

  // In general, this is used with DOM elements:

  // createBoundObject(() => {prop: $el.val()},
  //                   (f) => $el.change(f),
  //                   { validate: o => o.prop < 10, reset: o => $el.val(o.prop)})
  // This creates an object {prop: ?} which always matches the value of $el.

  let object = generate()
  listener(() => {
    let newObject = generate()
    if (validator === undefined || validator.validate(newObject)) {
      Object.assign(object, newObject)
    } else {
      validator.reset(object)
    }
  })

  return object
}

function animateEllipses($el) {
  let $ellipses = $el.find('.ellipses');

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
}

function createServerDOM(title) {
  let $server = $(`<div class="computer">
    <h4>${title}</h4>
    <textarea readonly class="text" rows="4" cols="50"></textarea>
    <div>~ <input type="number" class="delay" value="100"> ms latency</div>
  </div>`)

  let $text = $server.find('.text')
  let $delay = $server.find('.delay')
  let delay = createBoundDelay($delay)

  return [$server, $text, delay]
}

function createClientDOM(title, randomizeChecked) {
  randomizeChecked = randomizeChecked ? 'checked' : ''

  let $client = $(`<div class="computer">
    <h4>${title} <span class="converging ellipses"></span></h4>
  	<textarea class="text" rows="4" cols="50"></textarea>
  	<div><input type="checkbox" ${randomizeChecked} class="randomize"> randomly edit</div>
  </div>`)
  let $text = $client.find('.text')
  let $randomize = $client.find('.randomize')

  animateEllipses($client)

  let shouldRandomize = createBoundObject(
    () => {
      return {
        enabled: $randomize[0].checked
      }
    },
    (f) => $randomize.change(f)
  )

  return [ $client, $text, shouldRandomize ]
}

type Lock = { locked: boolean }

function generateLock(): Lock {
  return { locked: false }
}

function updateDOMTextbox($text, state: DocumentState): void {
  // cursorStart: number, cursorEnd: number
  $text.val(state.text)
  $text.prop("selectionStart", state.cursor.start),
  $text.prop("selectionEnd", state.cursor.end)
}

function getValuesFromDOMTextbox($text): [string, number, number] {
  return [
    $text.val(),
    $text.prop("selectionStart"),
    $text.prop("selectionEnd")
  ]
}

function bindToText(
  $text: any,
  onChange: (oldText: string, newText: string, cursor: {start: number, end: number}) => void,
  onHighlight: (cursor: {start: number, end: number}) => void,
) {
  let lock = generateLock()

  let [oldText, _, __] = getValuesFromDOMTextbox($text)

  $text.on('keyup mousedown mouseup', () => {
    let [___, newCursorStart, newCursorEnd] = getValuesFromDOMTextbox($text)
    onHighlight({start: newCursorStart, end: newCursorEnd})
  })

  $text.on('input propertychange change onpaste', () => {
    if (lock.locked) { return }

    let [newText, newCursorStart, newCursorEnd] = getValuesFromDOMTextbox($text)
    onChange(oldText, newText, {start: newCursorStart, end: newCursorEnd})
    oldText = newText
  })
}

$(document).ready(() => {
  // stuff to dependency inject
  let transformer = new LinearOperator()
  let applier = new DocumentApplier()
  let operator = new ContextualOperator(new LinearOperator(), applier)
  let inferrer = new TextInferrer()

  let $computers = $('#computers')

  let [$server, $serverText, delay] = createServerDOM("Server")
  $computers.prepend($server)

  // this simulates the network between server & clients
  let server = new Server(operator, applier)
  let network = new NetworkSimulator(server)

  window.server = server
  window.clients = []

  observeObject(server,
    (_, key) => {},// added
    (_, key) => {},// deleted
    (_, key) => {// changed
      $serverText.val(server.state.text)
    })

  let clientId = 1
  function addClient() {
    let [$client, $text, shouldRandomize] = createClientDOM(`Client ${clientId}`, clientId === 1, false)
    $client.insertBefore($server)
    clientId ++

    let client = new Client(operator, applier)
    network.addClient(client)
    window.clients.push(client)

    // on client state changes
    observeObject(client,
      (_, key) => {// added
      },
      (_, key) => {// deleted
      },
      (_, key) => {// changed
        updateDOMTextbox($text, client.state)
      },
    )

    let update = bindToText(
      $text,
      (oldText, newText, cursor) => { // on changes
        // always update the cursor
        client.state.cursor = cursor

        // compute changes to text
        let ops = inferrer.inferOps(oldText, newText)
        if (ops == null) { return }

        // compute request to server
        let request = client.localEdit(ops)
        if (request == null) { return }

        // send request across the network
        network.request(client.uid, request)
      },
      (cursor) => {
        // update the cursor
        client.state.cursor = cursor
      }
    )

    ;(async () => {
      while (true) {
        await asyncWait(500)
        if (client.state.text === server.state.text) {
          $client.find('.converging').hide()
        } else {
          $client.find('.converging').show()
        }
      }
    }) ();
  }

  addClient()
  addClient()

  let $clientButton = $('#add-client')
  $clientButton.click(() => addClient())

  ;(async () => {
    while (true) {
      let dt = delay.minDelay + (delay.maxDelay - delay.minDelay) * Math.random()
      await asyncWait(dt)

      network.deliverPackets(1)
    }
  })()
})
