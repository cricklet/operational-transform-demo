/* @flow */

import { genUid } from './utils.js'
import type { TextOperation } from './operations.js'

export type LogEntry = {
  sourceSite: Site,
  sourceState: SiteState,
  operation: TextOperation,
  priority: Priority
}

export type SiteState = {
  [site: Site]: number // how many operations from some site have been executed here?
}

export type Log = Array<Log>

export type Priority = Array<Site>;
export type Site = number;

export function generateSite(): Site {
  return Math.round(Math.random() * 1000);
}

export function generatePriority(operation: TextOperation, site: Site, state: SiteState): Priority {
  throw "Not implemented"
}
