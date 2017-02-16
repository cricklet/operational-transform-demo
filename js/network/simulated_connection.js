/* @flow */
import * as U from '../helpers/utils.js'
import { find } from 'wu'

export type Packet<D> = {
  index: number,
  data: D,
  source: string
}

export class SimulatedConnection<Outgoing, Incoming> {
  uid: string

  outgoingLog: Packet<Outgoing>[]
  incomingQueue: Packet<Incoming>[]

  nextOutgoingIndex: number
  nextIncomingIndex: {}

  chaos: {
    minDelay: number,
    maxDelay: number,
    dropPercentage: number,
  }

  otherRouters: SimulatedConnection<Incoming, Outgoing>[]

  listeners: ((data: Incoming) => void)[]

  logger: (s: string) => void

  constructor(
    chaos: {
      minDelay: number,
      maxDelay: number,
      dropPercentage: number,
    },
    logger?: (s: string) => void
  ) {
    this.uid = U.genUid()

    this.otherRouters = []

    this.outgoingLog = []
    this.incomingQueue = []

    this.nextOutgoingIndex = 0
    this.nextIncomingIndex = {}

    this.listeners = []

    this.chaos = chaos

    if (logger != null) { this.logger = logger }
    else { this.logger = s => {} }
  }

  listen(l: (data: Incoming) => void) {
    this.listeners.push(l)
  }

  send(data: Outgoing) {
    let packet = {
      index: this.nextOutgoingIndex,
      data: data,
      source: this.uid
    }

    this.nextOutgoingIndex ++
    this.outgoingLog.push(packet)

    // send!
    for (let other of this.otherRouters) {
      this.sendPacket(other, packet)
    }
  }

  _flushReceived() {
    while (true) {
      let packet: ?Packet<Incoming> = U.pop(
        this.incomingQueue, p => p.index === (this.nextIncomingIndex[p.source] || 0))

      if (packet == null) {
        break
      }

      this.nextIncomingIndex[packet.source] = (this.nextIncomingIndex[packet.source] || 0) + 1

      // received callback!
      for (let listener of this.listeners) {
        listener(packet.data)
      }
    }

    // remove old elements
    U.filterInPlace(this.incomingQueue, p => p.index >= (this.nextIncomingIndex[p.source] || 0))
  }

  sendPacket(other: SimulatedConnection<*,*>, packet: Packet<*>) {
    let delay = this.chaos.minDelay + Math.random() * (this.chaos.maxDelay - this.chaos.minDelay)
    setTimeout(() => {
      if (Math.random() >= this.chaos.dropPercentage) {
        // it worked!
        this.logger('sent outgoing packet #' + packet.index)
        other.receive(packet)
      } else {
        // it got dropped :(, retry
        this.logger('dropped outgoing packet #' + packet.index)
        this.sendPacket(other, packet)
      }
    }, delay)
  }

  receive(packet: Packet<Incoming>) {
    this.logger('incoming packet #' + packet.index + ' from ' + packet.source)
    this.incomingQueue.push(packet)
    this._flushReceived()
  }

  // this router can connect to other routers
  // all previously sent packets will be sent to this other router
  // all future pakcets will also be sent to this other router
  connect(other: SimulatedConnection<Incoming, Outgoing>): void {
    this.otherRouters.push(other)

    for (let packet of this.outgoingLog) {
      this.sendPacket(other, packet)
    }
  }
}
