import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const now = require('nano-time')

import { encode, decode } from '@msgpack/msgpack'

const decoder = new TextDecoder('utf-8')
const encoder = new TextEncoder('utf-8')

export function u8ToString (u8) { return decoder.decode(u8) }
export function stringToU8 (str) { return encoder.encode(str) }

export function serial (obj) {
  return new Uint8Array(encode(obj))
}

export function deserial (u8) {
  return decode(u8)
}

export function getdhc() {
  return parseInt(now.micro(), 10)
}

export function sleep (delai) {
  if (delai <= 0) return
  return new Promise((resolve) => { setTimeout(() => resolve(), delai) })
}
