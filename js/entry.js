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

function createServerDOM(title) {
  let $server = $(`<div class="computer">
    <h4>${title}</h4>
    <textarea readonly class="text" rows="4" cols="50"></textarea>
    <div>~ <input type="number" class="delay" value="1000"> ms latency</div>
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
  shouldRandomize: {enabled: boolean},
  randomizeDelay: number
) {
  (async () => {
    while (true) {
      if (shouldRandomize.enabled) {
        if (Math.random() > 0.4) {
          $text.val(addWord($text.val()))
          $text.trigger("change")
        } else {
          $text.val(deletePortion($text.val()))
          $text.trigger("change")
        }
        await asyncWait(randomizeDelay)
      } else {
        await asyncWait(1000)
      }
    }
  }) ();
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

$(document).ready(() => {
  // stuff to dependency inject
  let transformer = new SuboperationsTransformer(retainFactory)
  let applier = new TextApplier()
  let inferrer = new SimpleTextInferrer()
  let orchestrator = new Orchestrator(transformer, applier)

  let $computers = $('#computers')

  // client container
  let clients: Client<*,*>[] = []

  // server
  let [$server, $serverText, delay] = createServerDOM("Server")
  $computers.prepend($server)

  let server = generateServer({cursor: {start: 0, end: 0}, text: ''})
  observeObject(server,
    (_, key) => {},// added
    (_, key) => {},// deleted
    (_, key) => {// changed
      $serverText.val(server.state.text)
    },
  )

  // propogator between server & clients
  // this is basically the network that broadcasts client & server requests
  let logger = () => {} // console.log
  let propogator = generateAsyncPropogator(orchestrator, server, clients, logger, delay)

  let clientId = 1
  function addClient() {
    let [$client, $text, shouldRandomize] = createClientDOM(`Client ${clientId}`, clientId === 1, false)
    $client.insertBefore($server)
    clientId ++

    let client = generateClient({cursor: {start: 0, end: 0}, text: ''})
    setupClient(applier, inferrer, orchestrator, client, propogator, $text, delay)
    randomlyAdjustText($text, shouldRandomize, 500)

    clients.push(client);

    (async () => {
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
})
