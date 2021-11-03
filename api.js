const avro = require('avsc')

const version = '1'
exports.version = version

class AppExc {
  constructor (code, message, detail, stack) {
    this.code = code
    this.message = message || '?'
    this.detail = detail || ''
    if (stack) this.stack = stack
  }

  toString () {
    return JSON.stringify(this)
  }
}
exports.AppExc = AppExc

const arrayIntType = avro.Type.forSchema({ type: 'array', items: 'int' })
const mapIntType = avro.Type.forSchema({ type: 'map', values: 'int' })
const mapArrayIntType = avro.Type.forSchema({ type: 'map', values: arrayIntType })

const rowItem = avro.Type.forSchema({
  name: 'rowitem',
  type: 'record',
  fields: [
    { name: 'table', type: 'string' },
    { name: 'id', type: 'string' },
    { name: 'serial', type: ['null', 'bytes'], default: null }
  ]
})

const synclist = avro.Type.forSchema({
  name: 'synclist',
  type: 'record',
  fields: [
    { name: 'status', type: 'int' },
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rowItems', type: { type: 'array', items: [rowItem] } }
  ]
})

const echoArg = avro.Type.forSchema({
  name: 'echo',
  type: 'record',
  fields: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'string' },
    { name: 'to', type: 'int' },
    { name: 'org', type: ['null', 'string'], default: null }
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
    { name: 'rowItems', type: { type: 'array', items: [rowItem] } }
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
    { name: 'lav', type: mapArrayIntType },
    { name: 'lgr', type: mapArrayIntType }
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

const argTypes = {
  echo: [echoArg, echoResp],
  creationCompte: [creationCompte, respBase1],
  connexionCompte: [connexionCompte, respBase1],
  syncInvitgr: [sync1, respBase1],
  syncAbo: [sync2, respBase1],
  syncAv: [sync3, respBase1],
  syncGr: [sync3, respBase1]
}
exports.argTypes = argTypes

const types = { synclist }
exports.types = types
