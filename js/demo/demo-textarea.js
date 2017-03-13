/* @flow */

import { merge, Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray, asyncWait, insert, allEqual, remove } from '../helpers/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'

import type { DocumentState } from '../ot/applier.js'
import { TextApplier, DocumentApplier } from '../ot/applier.js'

import * as Inferrer from '../ot/inferrer.js'
import * as Transformer from '../ot/transformer.js'
import * as U from '../helpers/utils.js'

import { OTClientModel, OutOfOrderError } from '../models/ot_client_model.js'
import { OTServerModel } from '../models/ot_server_model.js'

import { SimulatedController } from '../controllers/simulated_controller.js'

import type { ClientEditMessage, ServerEditMessage, ClientRequestHistory } from '../models/message_types.js'

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
  client: OTClientModel<*>,
  $text: any,
  emit: (message: ClientEditMessage | ClientRequestHistory) => void
) {
  let lock = { ignoreEvents: false }

  let update = () => {
    // update the dom
    lock.ignoreEvents = true
    updateDOMTextbox($text, client.state)
    lock.ignoreEvents = false
  }

  client.addChangeListener(() => update())

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
        emit(update)
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
  </div>`)

  let $text = $server.find('.text')
  let $delay = $server.find('.delay')
  let $drop = $server.find('.drop')

  return [$server, $text, $delay]
}


function createClientDOM(title, randomizeChecked) {
  randomizeChecked = randomizeChecked ? 'checked' : ''

  let $client = $(`<div class="computer">
    <h4>${title} <span class="converging ellipses"></span></h4>
  	<textarea class="text" rows="4" cols="50"></textarea>
  	<div><input type="checkbox" ${randomizeChecked} class="randomize"> randomly edit</div>
  	<div><input type="checkbox" checked class="online"> online</div>
  </div>`)
  let $text = $client.find('.text')
  let $randomize = $client.find('.randomize')
  let $online = $client.find('.online')

  animateEllipses($client)

  return [ $client, $text, $online, $randomize ]
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
  ;(async () => {
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

  ;(async () => {
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

  let clients: OTClientModel<*>[] = []
  let server = new OTServerModel()

  let $serverContainer = $('#server')
  let $clientContainer = $('#clients')

  let [$server, $serverText, $delay] = createServerDOM("Server")
  let serverLogger = generateLogger($('#server-log'))
  $serverContainer.append($server)

  // update the dom w/ server state
  server.addChangeListener(() => $serverText.val(server.state()))

  // the network
  let networkDelay = {
    minDelay: Math.max(0, parseInt($delay.val()) - 500),
    maxDelay: parseInt($delay.val())
  }
  $delay.change(() => {
    networkDelay.minDelay = Math.max(0, parseInt($delay.val()) - 500)
    networkDelay.maxDelay = parseInt($delay.val())
  })

  let controller = new SimulatedController(networkDelay)
  controller.connectServer(server)
  controller.loop()

  let $clientPlaceholder = $('#client-placeholder')

  let clientId = 1
  function addClient() {
    let [$client, $text, $online, $randomize] = createClientDOM(`Client ${clientId}`, false, false)
    $client.insertBefore($clientPlaceholder)
    clientId ++

    let client = new OTClientModel(DocumentApplier)
    controller.connectClient(client)

    $online.change(() => {
      if ($online[0].checked) {
        controller.connectClient(client)
      } else {
        controller.disconnectClient(client)
      }
    })

    let shouldRandomize = { enabled: $randomize[0].checked }
    $randomize.change(() => {
      shouldRandomize.enabled = $randomize[0].checked
    })

    setupClient(client, $text, (update) => controller.send(client, update))
    randomlyAdjustText($text, shouldRandomize, 500)

    clients.push(client);

    ;(async () => {
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

  let $randomizeEverything = $('.randomize-everything')
  ;(async () => {
    while (true) {
      await asyncWait(1000)
      if ($randomizeEverything[0].checked === false) {
        continue
      }

      let $checkboxes = $('input[type=checkbox]').not('.randomize-everything')
      let i = Math.floor(Math.random() * $checkboxes.length) + 1
      $checkboxes.eq(i).click()
    }
  }) ();

  $('.all-online').click(() => {
    $('input[type=checkbox].online').prop('checked', true).change()
  })

  $('.all-offline').click(() => {
    $('input[type=checkbox].online').prop('checked', false).change()
  })

  $('.no-random').click(() => {
    $('input[type=checkbox].randomize-everything').prop('checked', false).change()
    $('input[type=checkbox].randomize').prop('checked', false).change()
  })

  let $clientButton = $('#add-client')
  $clientButton.click(() => addClient())

  window.clients = clients
  window.server = server
})
