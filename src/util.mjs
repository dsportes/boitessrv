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

const j0 = Math.floor(new Date('2020-01-01T00:00:00').getTime() / 86400000)

class Dds {  
  // jour courant (nombre de jours écoulés) depuis le 1/1/2020
  jourJ () {
    return Math.floor(new Date().getTime() / 86400000) - j0
  }

  /* 
  Si la dds actuelle du compte n'a pas plus de 28 jours, elle convient encore.
  Sinon il faut en réattribuer une qui ait entre 14 et 28 jours d'âge.
  */
  ddsc (dds) {
    const j = this.jourJ()
    return ((j - dds) > 28) ? j - 14 - Math.floor(Math.random() * 14) : dds
  }

  /* 
  Si la dds actuelle de l'avatar ou du groupe n'a pas plus de 14 jours, elle convient encore.
  Sinon il faut en réattribuer une qui ait entre 0 et 14 d'âge.
  */
  ddsag (dds) {
    const j = this.jourJ()
    return ((j - dds) > 14) ? j - Math.floor(Math.random() * 14) : dds
  }
}
export const dds = new Dds()

/* Mois courant depuis janvier 2020 */
// eslint-disable-next-line no-unused-vars
function getMois () {
  const d = new Date()
  const an = (d.getUTCFullYear() % 100) - 20
  const mo = d.getUTCMonth()
  return ( (an * 12) + mo)
}
