/* @flow */
import { genUid, pop, filterInPlace, subarray, objValues } from './utils.js'
import { find } from 'wu'

export type Packet<D> = {
  index: number,
  data: D,
  source: string
}

export interface IRouter<Outgoing, Incoming> {
  uid: string,

  broadcast(data: Outgoing): void,
  send(uid: string, data: Outgoing): void,

  onReceive: (data: Incoming) => void,
  onConnect: (otherUid: string) => void,
  onDisconnect: (otherUid: string) => void,
}

class InOrderRouter<Outgoing, Incoming> {
  uid: string

  outgoingLog: Packet<Outgoing>[]
  incomingQueue: Packet<Incoming>[]

  nextOutgoingIndex: number
  nextIncomingIndex: {}

  onReceive: (data: Incoming) => void
  onConnect: (otherUid: string) => void
  onDisconnect: (otherUid: string) => void

  delegate: IRouter<Packet<Outgoing>, Packet<Incoming>>

  logger: (s: string) => void

  constructor(
    delegate: IRouter<Packet<Outgoing>, Packet<Incoming>>,
    logger?: (s: string) => void
  ) {
    (this: IRouter<Outgoing, Incoming>)

    this.delegate = delegate
    this.uid = this.delegate.uid

    this.outgoingLog = []
    this.incomingQueue = []

    this.nextOutgoingIndex = 0
    this.nextIncomingIndex = {}

    this.onReceive = () => {}
    this.onConnect = () => {}
    this.onDisconnect = () => {}

    if (logger != null) { this.logger = logger }
    else { this.logger = s => {} }

    // listen to the delegate!
    this.delegate.onReceive = (packet) => { this._receive(packet) }
    this.delegate.onConnect = (otherUid) => { this._connect(otherUid) }
    this.delegate.onDisconnect = (otherUid) => { this._disconnect(otherUid) }
  }

  _connect(otherUid: string) {
    for (let packet of this.outgoingLog) {
      this.delegate.send(otherUid, packet)
    }
    this.onConnect(otherUid)
  }

  _disconnect(otherUid: string) {
    throw new Error('lol wat we can disconnect?')
  }

  _receive(packet: Packet<Incoming>) {
    this.logger('incoming packet #' + packet.index + ' from ' + packet.source)
    this.incomingQueue.push(packet)

    // flush all incoming packets!
    while (true) {
      let packet: ?Packet<Incoming> = pop(
        this.incomingQueue, p => p.index === (this.nextIncomingIndex[p.source] || 0))

      if (packet == null) {
        break
      }

      this.nextIncomingIndex[packet.source] = (this.nextIncomingIndex[packet.source] || 0) + 1

      // let the world know we have some data
      this.onReceive(packet.data)
    }

    // remove old packets
    filterInPlace(this.incomingQueue, p => p.index >= (this.nextIncomingIndex[p.source] || 0))
  }

  broadcast(data: Outgoing) {
    let packet: Packet<Outgoing> = {
      index: this.nextOutgoingIndex,
      data: data,
      source: this.uid
    }

    this.nextOutgoingIndex ++
    this.outgoingLog.push(packet)

    // send!
    this.delegate.broadcast(packet)
  }

  send(otherUid: string, data: Outgoing) {
    throw new Error('unimplemented... this confuses the whole notion of in-order')
  }
}


export class SimulatedRouter<Outgoing, Incoming> extends InOrderRouter<Outgoing, Incoming> {
  timeoutRouter: TimeoutRouter<*,*>

  constructor(
    chaos: {
      minDelay: number,
      maxDelay: number,
      dropPercentage: number,
    },
    logger?: (s: string) => void
  ) {
    let timeoutRouter = new TimeoutRouter(chaos, logger)
    super(timeoutRouter, logger)
    this.timeoutRouter = timeoutRouter
  }

  connect(other: SimulatedRouter<Incoming, Outgoing>): void {
    other.timeoutRouter.connect(this.timeoutRouter)
  }
}

class TimeoutRouter<Outgoing, Incoming> {
  uid: string

  chaos: {
    minDelay: number,
    maxDelay: number,
    dropPercentage: number,
  }

  otherRouters: { [uid: string]: TimeoutRouter<Incoming, Outgoing> }

  onReceive: (data: Incoming) => void
  onConnect: (otherUid: string) => void
  onDisconnect: (otherUid: string) => void

  logger: (s: string) => void

  constructor(
    chaos: {
      minDelay: number,
      maxDelay: number,
      dropPercentage: number,
    },
    logger?: (s: string) => void
  ) {
    (this: IRouter<Outgoing, Incoming>)
    this.uid = genUid()

    this.otherRouters = {}

    this.chaos = chaos

    this.onReceive = () => {}
    this.onConnect = () => {}
    this.onDisconnect = () => {}

    if (logger != null) { this.logger = logger }
    else { this.logger = s => {} }
  }

  broadcast(data: Outgoing) {
    // send!
    for (let other of objValues(this.otherRouters)()) {
      this._sendPacket(other, data)
    }
  }

  send(otherUid: string, data: Outgoing) {
    // send!
    let other = this.otherRouters[otherUid]
    this._sendPacket(other, data)
  }

  _sendPacket(other: TimeoutRouter<*,*>, data: Outgoing) {
    let delay = this.chaos.minDelay + Math.random() * (this.chaos.maxDelay - this.chaos.minDelay)
    setTimeout(() => {
      if (Math.random() >= this.chaos.dropPercentage) {
        // it worked!
        this.logger('sent outgoing packet')
        other.receive(data)
      } else {
        // it got dropped :(, retry
        this.logger('dropped outgoing packet')
        this._sendPacket(other, data)
      }
    }, delay)
  }

  receive(data: Incoming) {
    // callback!
    this.onReceive(data)
  }

  // this router can connect to other routers
  // all previously sent packets will be sent to this other router
  // all future pakcets will also be sent to this other router
  connect(other: TimeoutRouter<Incoming, Outgoing>): void {
    this.otherRouters[other.uid] = other

    // callback!
    this.onConnect(other.uid)
  }
}
