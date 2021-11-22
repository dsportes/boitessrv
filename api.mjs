import { schemas } from './schemas.mjs'
import './rowTypes.mjs'

export const version = '1'

export const PINGTO = 10000 // en secondes

export const E_BRK = -1 // Interruption volontaire de l'opération
export const E_WS = -2 // Toutes erreurs de réseau
export const E_DB = -3 // Toutes erreurs d'accès à la base locale
export const E_BRO = -4 // Erreur inattendue trappée sur le browser
export const E_SRV = -5 // Erreur inattendue trappée sur le serveur
export const X_SRV = -6 // Erreur fonctionnelle trappée sur le serveur transmise en exception
export const F_BRO = -7 // Erreur fonctionnelle trappée sur le browser
export const F_SRV = -8 // Erreur fonctionnelle trappée sur le serveur transmise en résultat

export class AppExc {
  constructor (code, message, stack) {
    this.code = code
    this.message = message || '?'
    if (stack) this.stack = stack
  }

  toString () {
    return JSON.stringify(this)
  }
}

export const INDEXT = {
  SECRET: 0,
  INVITGR: 1,
  AVATAR: 2,
  CONTACT: 3,
  INVITCT: 4,
  RENCONTRE: 5,
  PARRAIN: 6,
  GROUPE: 1,
  MEMBRE: 2
}

const arrayIntType = schemas.forSchema({ type: 'array', items: 'int' })
const arrayLongType = schemas.forSchema({ type: 'array', items: 'long' })
const mapIntType = schemas.forSchema({ type: 'map', values: 'int' })

const rowItem = schemas.forSchema({
  name: 'rowitem',
  type: 'record',
  fields: [
    { name: 'table', type: 'string' },
    { name: 'id', type: 'string' },
    { name: 'serial', type: ['null', 'bytes'], default: null }
  ]
})

schemas.forSchema({
  name: 'synclist',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rowItems', type: ['null', { type: 'array', items: [rowItem] }], default: null }
  ]
})

const echoArg = schemas.forSchema({
  name: 'echo',
  type: 'record',
  fields: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'string' },
    { name: 'to', type: 'int' },
    { name: 'org', type: ['null', 'string'], default: null }
  ]
})

const echoResp = schemas.forSchema({
  name: 'echoResp',
  type: 'record',
  fields: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'string' },
    { name: 'org', type: ['null', 'string'] }
  ]
})

const connexionCompte = schemas.forSchema({
  name: 'connexionCompte',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'pcbh', type: 'long' },
    { name: 'dpbh', type: 'long' }
  ]
})

const respBase1 = schemas.forSchema({
  name: 'respBase1',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rowItems', type: ['null', { type: 'array', items: [rowItem] }], default: null }
  ]
})

const creationCompte = schemas.forSchema({
  name: 'creationCompte',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'mdp64', type: 'string' },
    { name: 'q1', type: 'int' },
    { name: 'q2', type: 'int' },
    { name: 'qm1', type: 'int' },
    { name: 'qm2', type: 'int' },
    { name: 'clePub', type: 'string' },
    { name: 'rowCompte', type: 'bytes' },
    { name: 'rowAvatar', type: 'bytes' }
  ]
})

const sync1 = schemas.forSchema({
  name: 'sync1',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'lvav', type: mapIntType }
  ]
})

const sync2 = schemas.forSchema({
  name: 'sync2',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'idc', type: 'long' },
    { name: 'lav', type: arrayLongType },
    { name: 'lgr', type: arrayLongType }
  ]
})

const sync3 = schemas.forSchema({
  name: 'sync3',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'avgr', type: 'long' },
    { name: 'lv', type: arrayIntType }
  ]
})

const sync4 = schemas.forSchema({
  name: 'sync3',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'vcv', type: 'int' },
    { name: 'lcvmaj', type: arrayIntType },
    { name: 'lcvchargt', type: arrayIntType }
  ]
})

export const argTypes = {
  echo: [echoArg, echoResp],
  creationCompte: [creationCompte, respBase1],
  connexionCompte: [connexionCompte, respBase1],
  syncInvitgr: [sync1, respBase1],
  syncAbo: [sync2, respBase1],
  syncAv: [sync3, respBase1],
  syncGr: [sync3, respBase1],
  chargtCVs: [sync4, respBase1]
}
