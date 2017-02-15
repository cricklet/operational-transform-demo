/* @flow */
import { genUid, pop, filterInPlace, subarray } from './utils.js'
import { find } from 'wu'

export type Packet<D> = {
  index: number,
  data: D,
  source: string
}

export interface IRouter<OutgoingData, IncomingData> {
  // create a packet with this data
  // then, send it to all other connected routers
  send(data: OutgoingData): void,

  // callback for receiving packets from other routers!
  listen((data: IncomingData) => void): void,
}

export class SimulatedRouter<OutgoingData, IncomingData> {
  uid: string

  outgoingLog: Packet<OutgoingData>[]
  incomingQueue: Packet<IncomingData>[]

  nextOutgoingIndex: number
  nextIncomingIndex: {}

  chaos: {
    minDelay: number,
    maxDelay: number,
    dropPercentage: number,
  }

  otherRouters: SimulatedRouter<IncomingData, OutgoingData>[]

  listeners: ((data: IncomingData) => void)[]

  logger: (s: string) => void

  constructor(
    chaos: {
      minDelay: number,
      maxDelay: number,
      dropPercentage: number,
    },
    logger?: (s: string) => void
  ) {
    (this: IRouter<OutgoingData, IncomingData>)
    this.uid = genUid()

    this.otherRouters = []

    this.outgoingLog = []
    this.incomingQueue = []

    this.nextOutgoingIndex = 0
    this.nextIncomingIndex = {}

    this.chaos = chaos

    if (logger != null) { this.logger = logger }
    else { this.logger = s => {} }
  }

  listen(l: (data: IncomingData) => void) {
    this.listeners.push(l)
  }

  send(data: OutgoingData) {
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
      let packet: ?Packet<IncomingData> = pop(
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
    filterInPlace(this.incomingQueue, p => p.index >= (this.nextIncomingIndex[p.source] || 0))
  }

  sendPacket(other: SimulatedRouter<*,*>, packet: Packet<*>) {
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

  receive(packet: Packet<IncomingData>) {
    this.logger('incoming packet #' + packet.index + ' from ' + packet.source)
    this.incomingQueue.push(packet)
    this._flushReceived()
  }

  // this router can connect to other routers
  // all previously sent packets will be sent to this other router
  // all future pakcets will also be sent to this other router
  connect(other: SimulatedRouter<IncomingData, OutgoingData>): void {
    this.otherRouters.push(other)

    for (let packet of this.outgoingLog) {
      this.sendPacket(other, packet)
    }
  }
}
