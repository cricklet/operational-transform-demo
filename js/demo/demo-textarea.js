/* @flow */

import { merge, Less, Greater, Equal, reverse, push, findIndex, findLastIndex, subarray, asyncWait, insert, allEqual, remove } from '../helpers/utils.js'
import { count, zip, filter, find, takeWhile, take, map } from 'wu'

import type { DocumentState } from '../ot/applier.js'
import { TextApplier, DocumentApplier } from '../ot/applier.js'

import * as Inferrer from '../ot/inferrer.js'
import * as Transformer from '../ot/transformer.js'
import * as U from '../helpers/utils.js'

import { OTClientHelper, OutOfOrderError } from '../controllers/ot_client_helper.js'
import { OTServerHelper } from '../controllers/ot_server_helper.js'

import type { ClientEditMessage, ServerEditMessage, ClientRequestHistory } from '../controllers/message_types.js'

type Lock = { ignoreEvents: boolean }

type Propogator = {
  send: (packet: ?(ClientEditMessage | ClientRequestHistory)) => void,
  connect: (client: OTClientHelper<*>) => void,
  disconnect: (client: OTClientHelper<*>) => void,
}

function generatePropogator (
  server: OTServerHelper,
  delay: { maxDelay: number, minDelay: number }
): Propogator {

  let clients = []

  let clientBacklogs = {}
  let serverBacklog = []

  function delayMS() {
    return Math.random() * (delay.maxDelay - delay.minDelay) + delay.minDelay
  }

  function serverThink() {
    let clientMessage
    if (serverBacklog.length > 0) {
      clientMessage = serverBacklog.shift()
    }

    if (clientMessage == null) {
      return
    }

    console.log('handling: ', clientMessage)

    let clientUid = clientMessage.sourceUid

    // handle client message
    let serverMessages = server.handle(clientMessage)
    for (let serverMessage of serverMessages) {
      // send responses to the clients
      for (let client of clients) {
        clientBacklogs[client.uid].push(serverMessage)
      }
    }
  }

  function clientThink(client: OTClientHelper<*>) {
    let serverMessage
    if (clientBacklogs[client.uid].length > 0) {
      serverMessage = clientBacklogs[client.uid].shift()
    }

    if (serverMessage == null) {
      return
    }

    console.log('client', client.uid, 'handling: ', serverMessage)

    try {
      // Apply the server edit & compute response
      let clientMessage: ?ClientEditMessage = client.handle(serverMessage)
      if (clientMessage != null) {
        serverBacklog.push(clientMessage)
      }

    } catch (e) {
      // Our fake network doesn't completely guarantee in-order edits...
      // If we run into out-of-order requests, reset the history.
      if (e instanceof OutOfOrderError) {
        let [historyRequest, editMessage] = client.generateSetupRequests()
        serverBacklog.push(historyRequest)
        serverBacklog.push(editMessage)
      } else {
        throw e
      }
    }
  }

  // run the server
  ;(async () => {
    while (true) {
      serverThink()
      await U.asyncSleep(delayMS())
    }
  })()

  // run the client
  function runClient (client: OTClientHelper<*>) {
    ;(async () => {
      while (true) {
        if (!U.contains(clients, client)) {
          break
        }

        clientThink(client)
        await U.asyncSleep(delayMS())
      }
    })()
  }

  return {
    send: (data) => {
      serverBacklog.push(data)
    },
    connect: (client: OTClientHelper<*>) => {
      if (U.contains(clients, client)) {
        return
      }

      clientBacklogs[client.uid] = []
      clients.push(client)

      // start listening to the network
      runClient(client)

      for (let clientMessage of client.generateSetupRequests()) {
        serverBacklog.push(clientMessage)
      }
    },
    disconnect: (client: OTClientHelper<*>) => {
      clientBacklogs[client.uid] = []
      let poppedClient = U.pop(clients, c => c === client)
      if (poppedClient == null) {
        throw new Error('wat')
      }
    }
  }
}


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
  client: OTClientHelper<*>,
  $text: any,
  emit: (message: ClientEditMessage | ClientRequestHistory) => void
) {
  let lock = generateLock()

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

  let clients: OTClientHelper<*>[] = []
  let server = new OTServerHelper()

  let $serverContainer = $('#server')
  let $clientContainer = $('#clients')

  let [$server, $serverText, $delay] = createServerDOM("Server")
  let serverLogger = generateLogger($('#server-log'))
  $serverContainer.append($server)

  // update the dom w/ server state
  server.addChangeListener(() => $serverText.val(server.state()))
  server.addChangeListener(() => console.log("NEW CHANGE", server.state()))

  // the network
  let networkDelay = {
    minDelay: Math.max(0, parseInt($delay.val()) - 500),
    maxDelay: parseInt($delay.val())
  }
  $delay.change(() => {
    networkDelay.minDelay = Math.max(0, parseInt($delay.val()) - 500)
    networkDelay.maxDelay = parseInt($delay.val())
  })
  let propogator = generatePropogator(server, networkDelay)

  let $clientPlaceholder = $('#client-placeholder')

  let clientId = 1
  function addClient() {
    let [$client, $text, $online, $randomize] = createClientDOM(`Client ${clientId}`, false, false)
    $client.insertBefore($clientPlaceholder)
    clientId ++

    let client = new OTClientHelper(DocumentApplier)
    propogator.connect(client)

    $online.change(() => {
      if ($online[0].checked) {
        propogator.connect(client)
      } else {
        propogator.disconnect(client)
      }
    })

    let shouldRandomize = { enabled: $randomize[0].checked }
    $randomize.change(() => { shouldRandomize.enabled = $randomize[0].checked })

    setupClient(client, $text, (update) => propogator.send(update))
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
      console.log($checkboxes)
      let i = Math.floor(Math.random() * $checkboxes.length) + 1
      $checkboxes.eq(i).click()
    }
  }) ();

  $('.all-online').click(() => {
    $('input[type=checkbox].online').prop('checked', true)
  })

  $('.all-offline').click(() => {
    $('input[type=checkbox].online').prop('checked', false)
  })

  let $clientButton = $('#add-client')
  $clientButton.click(() => addClient())

  window.clients = clients
  window.server = server
})
