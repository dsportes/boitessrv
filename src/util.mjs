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

/*
const j0 = Math.floor(new Date('2020-01-01T00:00:00').getTime() / 86400000)

class Dds {  
  // jour courant (nombre de jours écoulés) depuis le 1/1/2020
  jourJ (date) {
    const d = date || new Date()
    return Math.floor(d.getTime() / 86400000) - j0
  }

  semaine (j) {
    const ns = Math.floor((j + 1) / 7) + 1
    const nj = ((j + 1) % 7) + 1
    return [ns, nj]
  }

  aaaammjj (j) {
    return new Date((j0 + j) * 86400000).toISOString().substring(0, 10)
  }

  ddsc (dds) {
    const j = this.jourJ()
    return ((j - dds) > 28) ? j - 14 - Math.floor(Math.random() * 14) : dds
  }

  ddsag (dds) {
    const j = this.jourJ()
    return ((j - dds) > 14) ? j - Math.floor(Math.random() * 14) : dds
  }
}
export const dds = new Dds()

export const j99 = dds.jourJ(new Date('2099-12-31T23:59:59')) // 29220 = 365 * 80 + 20 (années bisextiles)
*/
// console.log('j99 = ' + j99)

/* Mois courant depuis janvier 2020 
// eslint-disable-next-line no-unused-vars
function getMois () {
  const d = new Date()
  const an = (d.getUTCFullYear() % 100) - 20
  const mo = d.getUTCMonth()
  return ( (an * 12) + mo)
}
*/
/*
let j1 = 1
console.log(dds.aaaammjj(j1))
const [ns, nj] = dds.semaine(j1)
console.log(ns + ' / ' + nj)
j1 = 367
console.log(dds.aaaammjj(j1))
const [ns2, nj2] = dds.semaine(j1)
console.log(ns2 + ' / ' + nj2)
*/
