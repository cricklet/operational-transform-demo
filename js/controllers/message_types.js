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
  sourceUid?: string,
  edit: ServerEdit,

  opts: {
    ignoreAtSource?: boolean,
    ignoreIfNotAtSource?: boolean
  }
|}

export type ServerEditsMessage = {|
  kind: 'ServerEditsMessage',
  edits: ServerEdit[]
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
  if (obj.sourceUid == null || obj.docId == null) { throw new Error('bad update') }
  castUpdateEdit(obj.edit)
  /* @flow-ignore */
  return obj
}

export function castClientConnectionRequest(obj: Object): ?ClientConnectionRequest {
  if (obj.kind !== 'ClientConnectionRequest') { return undefined }
  if (obj.sourceUid == null || obj.docId == null) { throw new Error('bad reset') }
  if ('edit' in obj) {
    castUpdateEdit(obj.edit)
  }
  /* @flow-ignore */
  return obj
}

export function castServerEditMessage(obj: Object): ?ServerEditMessage {
  if (obj.kind !== 'ServerEditMessage') { return undefined }
  if (obj.docId == null) { throw new Error('bad update') }
  castServerEdit(obj.edit)
  /* @flow-ignore */
  return obj
}

export function castServerEditsMessage(obj: Object): ?ServerEditsMessage {
  if (obj.kind !== 'ServerEditsMessage') { return undefined }
  if (obj.docId == null || obj.edits == null || !Array.isArray(obj.edits)) { throw new Error('bad update') }
  for (let edit of obj.edits) {
    castServerEdit(edit)
  }
  /* @flow-ignore */
  return obj
}
