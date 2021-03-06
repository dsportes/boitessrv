import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const now = require('nano-time')

const decoder = new TextDecoder('utf-8')
const encoder = new TextEncoder('utf-8')

export function u8ToString (u8) { return decoder.decode(u8) }
export function stringToU8 (str) { return encoder.encode(str) }

export function getdhc() {
  return parseInt(now.micro(), 10)
}

export function sleep (delai) {
  if (delai <= 0) return
  return new Promise((resolve) => { setTimeout(() => resolve(), delai) })
}

// Mots clés en string ('245/232/21' en Uint8Array)
export function mcsToU8 (s) {
  const a = []
  if (s) {
    const x = s.substring(1, s.length - 1).split('/')
    x.forEach(n => a.push(parseInt(n)))
  }
  return new Uint8Array(a)
}

export function u8ToMcs (u8) {
  return u8 && u8.length ? '/' + u8.join('/') + '/' : null
}