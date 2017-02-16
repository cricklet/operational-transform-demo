/* @flow */

export type Insert = string
export type Remove = number // always negative
export type Retain = number // always positive

export type OpComponent = Insert | Remove | Retain

export type Operation = OpComponent[]
