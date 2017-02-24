
import type { ClientEditMessage, ServerEditMessage, ClientRequestHistory } from '../models/message_types.js'

export type SimulatedController = {
  send: (packet: ClientEditMessage) => void,
  connect: (client: OTClientModel<*>) => void,
  disconnect: (client: OTClientModel<*>) => void,
}

class SimulatedClientController {
  backlog: ServerEdit[]
}

function setupSimulatedController (
  server: OTServerModel,
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

  function clientThink(client: OTClientModel<*>) {
    if (clientBacklogs[client.uid].length === 0) {
      return
    }

    let serverMessage = clientBacklogs[client.uid].shift()

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
  function runClient (client: OTClientModel<*>) {
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
    connect: (client: OTClientModel<*>) => {
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
    disconnect: (client: OTClientModel<*>) => {
      clientBacklogs[client.uid] = []
      let poppedClient = U.pop(clients, c => c === client)
      if (poppedClient == null) {
        throw new Error('wat')
      }
    }
  }
}
