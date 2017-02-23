/* @flow */

import type {
  ServerEdit,
  UpdateEdit,
} from './edit_types.js'

import {
  castServerEdit,
  castUpdateEdit,
} from './edit_types.js'

export type ServerEditMessage = {|
  kind: 'ServerEditMessage',
  edit: ServerEdit,
|}

export type ClientEditMessage = {|
  kind: 'ClientEditMessage',
  sourceUid: string,
  edit: UpdateEdit
|}

export type ClientConnectionRequest = {|
  kind: 'ClientConnectionRequest',
  sourceUid: string,
  nextIndex: number,
  edit: ?UpdateEdit,
|}

export function castClientEditMessage(obj: Object): ?ClientEditMessage {
  if (obj.kind !== 'ClientEditMessage') { return undefined }
  if (obj.sourceUid == null) { throw new Error('bad update') }
  castUpdateEdit(obj.edit)
  /* @flow-ignore */
  return obj
}

export function castClientConnectionRequest(obj: Object): ?ClientConnectionRequest {
  if (obj.kind !== 'ClientConnectionRequest') { return undefined }
  if (obj.sourceUid == null || obj.nextIndex == null) { throw new Error('bad connection request') }
  if ('edit' in obj) {
    castUpdateEdit(obj.edit)
  }
  /* @flow-ignore */
  return obj
}

export function castServerEditMessage(obj: Object): ?ServerEditMessage {
  if (obj.kind !== 'ServerEditMessage') { return undefined }
  if (obj.ack == null || obj.mode == null) { throw new Error('bad edit message') }
  castServerEdit(obj.edit)
  /* @flow-ignore */
  return obj
}
