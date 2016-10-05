/* @flow */

import { genUid, Greater, Equal, Less } from './utils.js'
import type { Comparison } from './utils.js'
import type { TextOperation, DeleteOperation, InsertOperation } from './operations.js'

export type LogEntry = {
  sourceSite: Site,
  sourceState: SiteState,
  sourceOperation: DeleteOperation | InsertOperation, // untransformed
  priority: Priority
}

export type Log = Array<LogEntry>

export type SiteState = {
  [site: Site]: number // how many operations from some site have been executed here?
}

export type Priority = Array<Site>;
export type Site = number;

export function generateSite(): Site {
  return Math.round(Math.random() * 1000);
}

export function comparePriorities(p0: Priority, p1: Priority): Comparison {
  throw "wat"
}

export function generatePriority(operation: DeleteOperation | InsertOperation, site: Site, log: Log): Priority {
  let conflictingLog = log.filter((logEntry: LogEntry) => {
    return logEntry.sourceOperation.position == operation.position
  })

  throw "wat"
}
