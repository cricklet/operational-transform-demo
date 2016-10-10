/* @flow */

import { genUid, range, maxOfIterable, allKeys, clone, Greater, Equal, Less } from './utils.js'
import type { Comparison } from './utils.js'
import type { TextOperation, DeleteOperation, InsertOperation } from './operations.js'

/* a queue of requests waiting to be executed
 *
 * requests are added when:
 *  1) site process receives a request from the network
 *  2) site process receives a request from site's user
 *
 * entries are removed when the site process determines that the requested
 * operation may be executed
 *
 * note, this is not FIFO */
export type Requests = Array<Request>

export type Request = {
  sourceSite: Site, // originating site - can be the local site
  sourceOperation: DeleteOperation | InsertOperation, // untransformed
  sourceState: SiteState, // source state @ time of operation
  priority: Priority
}

/* a log of requests executed at this site
 *
 * the log is ordered by insertion
 */
export type Log = Array<LogEntry>

export type LogEntry = {
  sourceSite: Site, // source of operation - can be the local site
  sourceOperation: SiteState, // source state @ time of operation
  localOperation: DeleteOperation | InsertOperation, // transformed
  localState: SiteState, // local state @ time of operation
  priority: Priority // priority from the source
}

export type SiteState = {
  [site: SiteString]: number // how many operations from some site have been executed here?
}

export type Priority = Array<Site>;
export type Site = number;
export type SiteString = string;

export function generateSite(): Site {
  return Math.round(Math.random() * 1000);
}

export function updateStateWithOperation(
  localState: SiteState,
  sourceSite: SiteString
): SiteState {
  let newState = clone(localState)
  newState[sourceSite] = (newState[sourceSite] || 0) + 1
  return newState
}

export function stateComparitor(s0: SiteState, s1: SiteState): Comparison {
  for (let site of allKeys(s0, s1)) {
    let numExecuted0 = s0[site] || 0
    let numExecuted1 = s1[site] || 0

    if (numExecuted0 > numExecuted1) {
      return Greater
    }

    if (numExecuted0 < numExecuted1) {
      return Less
    }
  }

  return Equal
}

export function priorityComparitor(p0: Priority, p1: Priority): Comparison {
  for (let i of range(Math.min(p0.length, p1.length))) {
    if (p0[i] === p1[i]) continue
    if (p0[i] < p1[i]) return Less
    if (p0[i] > p1[i]) return Greater // larger has priority
  }

  if (p0.length === p1.length) return Equal
  if (p0.length < p1.length) return Less
  if (p0.length > p1.length) return Greater // longer has priority

  throw "wat"
}

export function generatePriority(
  operation: DeleteOperation | InsertOperation,
  site: Site,
  log: Log
): Priority {
  // compile a list of past conflicting operations
  let conflictingLogs = log.filter((log: LogEntry) =>
    log.localOperation.position == operation.position)

  if (conflictingLogs.length === 0) { return [site] }

  // get the highest priority past conflict
  let conflictingLog: LogEntry = maxOfIterable(
    conflictingLogs,
    (t0, t1) => priorityComparitor(t0.priority, t1.priority))

  // our priority is built on the conflicting priority
  return conflictingLog.priority.concat(site) // not mutating :)
}
