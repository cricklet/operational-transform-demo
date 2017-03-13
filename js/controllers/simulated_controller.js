/* @flow */

import * as U from '../helpers/utils.js'

import type { ClientEditMessage, ServerEditMessage, ClientRequestHistory } from '../models/message_types.js'
import { OTClientModel, OutOfOrderError } from '../models/ot_client_model.js'
import { OTServerModel } from '../models/ot_server_model.js'

export class SimulatedController {
  // queues for the server
  serverQueue: (ClientEditMessage | ClientRequestHistory)[]

  // messages being sent to the clients
  clientQueues: { [clientUid: string]: (ServerEditMessage)[] }

  // whether this client needs to reconnect
  clientNeedsHistory: { [clientUid: string]: boolean }

  server: ?OTServerModel
  clients: { [clientUid: string]: OTClientModel<*> }

  delay: { maxDelay: number, minDelay: number }

  constructor (delay: { maxDelay: number, minDelay: number }) {
    this.server = undefined
    this.clients = {}

    this.serverQueue = []
    this.clientQueues = {}

    this.clientNeedsHistory = {}

    this.delay = delay
  }

  _serverThink() {
    let clientMessage = this.serverQueue.shift()
    if (this.server == null || clientMessage == null) { return }

    let responses = this.server.handle(clientMessage)

    if (clientMessage.kind === 'ClientRequestHistory') {
      for (let response of responses) {
        let queue = this.clientQueues[clientMessage.sourceUid]
        if (queue != null) {
          queue.push(response)
        }
      }
    } else if (clientMessage.kind === 'ClientEditMessage') {
      for (let clientUid in this.clientQueues) {
        for (let response of responses) {
          this.clientQueues[clientUid].push(response)
        }
      }
    } else {
      throw new Error('wat')
    }
  }

  _clientThink(clientUid: string) {
    let client = this.clients[clientUid]

    // reconnect if necessary
    if (this.clientNeedsHistory[clientUid] == true) {
      this.clientNeedsHistory[clientUid] = false

      let [request, message] = client.generateHistoryRequest()
      this.send(client, request)
      if (message != null) {
        this.send(client, message)
      }
      return
    }

    let serverMessage = this.clientQueues[clientUid].shift()
    if (client == null || serverMessage == null) { return }

    try {
      // apply the edit
      let response = client.handle(serverMessage)
      if (response != null) {
        this.serverQueue.push(response)
      }

      // successful edit applied! we're synced :)
      this.clientNeedsHistory[clientUid] = false

    } catch (e) {
      if (!(e instanceof OutOfOrderError)) {
        throw e
      }

      // failed to apply edit! we're out of sync
      this.clientNeedsHistory[clientUid] = true
    }
  }

  loop() {
    ;(async () => {
      while (true) {
        await U.asyncSleep(Math.random() * (this.delay.maxDelay - this.delay.minDelay) + this.delay.minDelay)
        for (let clientUid in this.clientQueues) {
          this._clientThink(clientUid)
        }

        await U.asyncSleep(Math.random() * (this.delay.maxDelay - this.delay.minDelay) + this.delay.minDelay)
        this._serverThink()
      }
    })()
  }

  connectClient(client: OTClientModel<*>) {
    this.clients[client.uid] = client
    this.clientNeedsHistory[client.uid] = true
    this.clientQueues[client.uid] = []
  }

  disconnectClient(client: OTClientModel<*>) {
    delete this.clients[client.uid]
    delete this.clientQueues[client.uid]
    delete this.clientNeedsHistory[client.uid]
  }

  connectServer(server: OTServerModel) {
    this.server = server
    this.serverQueue = []
  }

  disconnectServer(server: OTServerModel) {
    this.server = undefined
    this.serverQueue = []
  }

  send(client: OTClientModel<*>, message: (ClientEditMessage | ClientRequestHistory)) {
    this.serverQueue.push(message)
  }
}
