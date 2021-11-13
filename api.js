/* eslint-disable quote-props */
const avro = require('avsc')

const version = '1'
exports.version = version

const PINGTO = 3000
exports.PINGTO = PINGTO

exports.E_BRK = -1 // Interruption volontaire de l'opération
exports.E_WS = -2 // Toutes erreurs de réseau
exports.E_DB = -3 // Toutes erreurs d'accès à la base locale
exports.E_BRO = -4 // Erreur inattendue trappée sur le browser
exports.E_SRV = -5 // Erreur inattendue trappée sur le serveur
exports.X_SRV = -6 // Erreur fonctionnelle trappée sur le serveur transmise en exception
exports.F_BRO = 1 // Erreur fonctionnelle trappée sur le browser
exports.F_SRV = 2 // Erreur fonctionnelle trappée sur le serveur transmise en résultat

class AppExc {
  constructor (code, message, stack) {
    this.code = code
    this.message = message || '?'
    if (stack) this.stack = stack
  }

  toString () {
    return JSON.stringify(this)
  }
}
exports.AppExc = AppExc

exports.SECRET = 0
exports.INVITGR = 1
exports.AVATAR = 2
exports.CONTACT = 3
exports.INVITCT = 4
exports.RENCONTRE = 5
exports.PARRAIN = 6
exports.GROUPE = 1
exports.MEMBRE = 2

const arrayIntType = avro.Type.forSchema({ type: 'array', items: 'int' })
const arrayLongType = avro.Type.forSchema({ type: 'array', items: 'long' })
const mapIntType = avro.Type.forSchema({ type: 'map', values: 'int' })
// const mapArrayIntType = avro.Type.forSchema({ type: 'map', values: arrayIntType })

const rowItem = avro.Type.forSchema({
  name: 'rowitem',
  type: 'record',
  fields: [
    { name: 'table', type: 'string' },
    { name: 'id', type: 'string' },
    { name: 'serial', type: ['null', 'bytes'], 'default': null }
  ]
})

const synclist = avro.Type.forSchema({
  name: 'synclist',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rowItems', type: ['null', { type: 'array', items: [rowItem] }], 'default': null }
  ]
})

const echoArg = avro.Type.forSchema({
  name: 'echo',
  type: 'record',
  fields: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'string' },
    { name: 'to', type: 'int' },
    { name: 'org', type: ['null', 'string'], 'default': null }
  ]
})

const echoResp = avro.Type.forSchema({
  name: 'echoResp',
  type: 'record',
  fields: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'string' },
    { name: 'org', type: ['null', 'string'] }
  ]
})

const connexionCompte = avro.Type.forSchema({
  name: 'connexionCompte',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'pcbh', type: 'long' },
    { name: 'dpbh', type: 'long' }
  ]
})

const respBase1 = avro.Type.forSchema({
  name: 'respBase1',
  type: 'record',
  fields: [
    { name: 'status', type: 'int' },
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rowItems', type: ['null', { type: 'array', items: [rowItem] }], 'default': null }
  ]
})

const creationCompte = avro.Type.forSchema({
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

const sync1 = avro.Type.forSchema({
  name: 'sync1',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'lvav', type: mapIntType }
  ]
})

const sync2 = avro.Type.forSchema({
  name: 'sync2',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'idc', type: 'long' },
    { name: 'lav', type: arrayLongType },
    { name: 'lgr', type: arrayLongType }
  ]
})

const sync3 = avro.Type.forSchema({
  name: 'sync3',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'avgr', type: 'long' },
    { name: 'lv', type: arrayIntType }
  ]
})

const sync4 = avro.Type.forSchema({
  name: 'sync3',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'vcv', type: 'int' },
    { name: 'lcvmaj', type: arrayIntType },
    { name: 'lcvchargt', type: arrayIntType }
  ]
})

const argTypes = {
  echo: [echoArg, echoResp],
  creationCompte: [creationCompte, respBase1],
  connexionCompte: [connexionCompte, respBase1],
  syncInvitgr: [sync1, respBase1],
  syncAbo: [sync2, respBase1],
  syncAv: [sync3, respBase1],
  syncGr: [sync3, respBase1],
  chargtCVs: [sync4, respBase1]
}
exports.argTypes = argTypes

const types = { synclist }
exports.types = types
