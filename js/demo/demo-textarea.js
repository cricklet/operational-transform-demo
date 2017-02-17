/* @flow */

import { merge, Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray, asyncWait, insert, allEqual, remove } from '../helpers/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'
import { observeArray, observeObject } from '../helpers/observe'

import type { DocumentState } from '../ot/applier.js'
import { TextApplier, DocumentApplier } from '../ot/applier.js'

import * as Inferrer from '../ot/inferrer.js'
import * as Transformer from '../ot/transformer.js'

import type { ClientUpdatePacket, ServerUpdatePacket } from '../controllers/types.js'
import { ClientController } from '../controllers/client_controller.js'
import { ServerController } from '../controllers/server_controller.js'
import { OTHelper } from '../controllers/ot_helper.js'

import { SimulatedConnection } from '../network/simulated_connection.js'

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
  client: ClientController<*>,
  connection: SimulatedConnection<*,*>,
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
    let editOps = Inferrer.inferOperation(client.state.text, newText)
    if (editOps != null) {
      let update = client.performEdit(editOps)
      if (update != null) {
        connection.send(update)
      }
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
    <div>~ <input type="number" class="delay" value="500"> ms latency</div>
    <div>~ <input type="number" class="drop" value="0.5"> % dropped</div>
  </div>`)

  let $text = $server.find('.text')
  let $delay = $server.find('.delay')
  let $drop = $server.find('.drop')

  let delay = createBoundDelay($delay)
  let dropped = createBoundDrop($drop)

  let chaos: { dropPercentage: number, maxDelay: number, minDelay: number }
    = boundedMerge(delay, dropped)

  return [$server, $text, chaos]
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

function boundedMerge(b1, b2) {
  let b = merge(b1, b2)
  observeObject(b1,
      () => Object.assign(b, b1),
      () => Object.assign(b, b1),
      () => Object.assign(b, b1))
  observeObject(b2,
      () => Object.assign(b, b2),
      () => Object.assign(b, b2),
      () => Object.assign(b, b2))
  return b
}

function createBoundDrop($drop): { dropPercentage: number } {
  let drop: { dropPercentage: number } = createBoundObject(
    () => { // generate the delay object based on $delay's value
      return {
        dropPercentage: parseFloat($drop.val())
      }
    },
    (f) => $drop.change(f), // update the delay object when $delay changes
  )
  return drop
}

function createBoundDelay($delay): { minDelay: number, maxDelay: number } {
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

function generateLogger($log) {
  return s => {
    let $entry = $(`<div>${s}</div>`)
    $log.prepend($entry)
    setTimeout(() => {
      $entry.remove()
    }, 1000)
  }
}

$(document).ready(() => {
  let DOC_ID = 'asdf1234'

  // stuff to dependency inject
  let DocumentOTHelper = new OTHelper(DocumentApplier)
  let TextOTHelper = new OTHelper(TextApplier)

  let $serverContainer = $('#server')
  let $clientContainer = $('#clients')

  let [$server, $serverText, chaos] = createServerDOM("Server")
  let serverLogger = generateLogger($('#server-log'))
  $serverContainer.append($server)

  let clients: ClientController<*>[] = []
  let clientConnections = []

  let server = new ServerController(TextOTHelper)
  let serverConnection: SimulatedConnection<ServerUpdatePacket, ClientUpdatePacket> = new SimulatedConnection(chaos, serverLogger)
  serverConnection.listen((clientUpdate: ClientUpdatePacket) => {
    let serverUpdate: ServerUpdatePacket = server.handleUpdate(clientUpdate)
    serverConnection.send(serverUpdate)
  })

  observeObject(server,
    (_, key) => {},// added
    (_, key) => {},// deleted
    (_, key) => {// changed
      $serverText.val(server.state.text)
    },
  )

  let $clientPlaceholder = $('#client-placeholder')

  let clientId = 1
  function addClient() {
    let [$client, $text, shouldRandomize] = createClientDOM(`Client ${clientId}`, clientId === 1, false)
    $client.insertBefore($clientPlaceholder)
    clientId ++

    let client = new ClientController(DOC_ID, DocumentOTHelper)
    let clientConnection: SimulatedConnection<ClientUpdatePacket, ServerUpdatePacket> = new SimulatedConnection(chaos)
    clientConnection.listen((serverUpdate: ServerUpdatePacket) => {
      let update = client.handleUpdate(serverUpdate)
      if (update == null) { return }
      clientConnection.send(update)
    })

    clientConnection.connect(serverConnection)
    serverConnection.connect(clientConnection)

    clientConnections.push(clientConnection)

    setupClient(client, clientConnection, $text)
    randomlyAdjustText($text, shouldRandomize, 500)

    clients.push(client);

    (async () => {
      while (true) {
        await asyncWait(500)
        if (client.state.text === server.state(DOC_ID)) {
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

  window.clients = clients
  window.server = server

  window.serverConnection = serverConnection
  window.clientConnections = clientConnections
})
