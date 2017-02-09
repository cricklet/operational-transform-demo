/* @flow */
import { genUid, pop, filterInPlace, subarray } from './utils.js'
import { find } from 'wu'

type Packet<D> = {
  index: number,
  data: D,
  source: string
}

export interface IRouter<OutgoingData, IncomingData> {
  // create a packet with this data
  // then, send it to all other connected routers
  send(data: OutgoingData): void,

  // callback for receiving packets from other routers!
  onReceive: (data: IncomingData) => void,
}

export class SimulatedRouter<OutgoingData, IncomingData> {
  uid: string

  outgoingLog: Packet<OutgoingData>[]
  incomingQueue: Packet<IncomingData>[]

  nextOutgoingIndex: number
  nextIncomingIndex: number

  delay: number
  drop: number

  otherRouters: SimulatedRouter<IncomingData, OutgoingData>[]

  onReceive: (data: IncomingData) => void

  constructor(
    onReceive: (data: IncomingData) => void,
    delay: number,
    drop: number
  ) {
    (this: IRouter<OutgoingData, IncomingData>)
    this.uid = genUid()

    this.onReceive = onReceive

    this.otherRouters = []

    this.outgoingLog = []
    this.incomingQueue = []

    this.nextOutgoingIndex = 0
    this.nextIncomingIndex = 0

    if (drop >= 1 || drop <= 0) {
      throw new Error('drop should be a percent between 0.0 and 1.0')
    }

    this.delay = delay
    this.drop = drop
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
      let incomingPacket: ?Packet<IncomingData> = pop(
        this.incomingQueue, p => p.index === this.nextIncomingIndex)

      console.log(incomingPacket, ':', this.incomingQueue)

      if (incomingPacket == null) {
        break
      }

      this.nextIncomingIndex ++

      // received callback!
      this.onReceive(incomingPacket.data)
    }

    // remove old elements
    filterInPlace(this.incomingQueue, p => p.index < this.nextIncomingIndex)

    console.log(' :', this.incomingQueue, '\n')
  }

  sendPacket(other: SimulatedRouter<*,*>, packet: Packet<*>) {
    setTimeout(() => {
      if (Math.random() >= this.drop) {
        // got dropped :(
        other.receive(packet)
      } else {
        // keep trying!
        this.sendPacket(other, packet)
      }
    }, Math.random() * this.delay)
  }

  receive(packet: Packet<IncomingData>) {
    console.log('received', packet)
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
