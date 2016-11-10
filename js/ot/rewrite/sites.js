/* @flow */

import * as Operations from './operations'
import type { TextOperation } from './operations'

export type Server = {
  kind: 'Server'
} & Site

export type Client = {
  kind: 'Client'
} & Site

export type Site = {
  operations: Array<TextOperation>, // known operations
  transformed: { // cache of transformed operations
    [op1: string]: {
      [op2: string]: TextOperation
    }
  }
}
