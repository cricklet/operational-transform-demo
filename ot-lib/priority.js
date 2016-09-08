/* @flow */

import { genUid } from './utils.js'

export type Priority = string;

export function generatePriority(): Priority {
  return genUid();
}
