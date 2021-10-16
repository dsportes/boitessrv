const avro = require('avsc')

const version = '1'
exports.version = version

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

/*
const conn1Compte = avro.Type.forSchema({
  name: 'conn1Compte',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'pcbsh', type: 'long' },
    { name: 'dpbh', type: 'long' }
  ]
})
*/

const respBase1 = avro.Type.forSchema({
  name: 'respBase1',
  type: 'record',
  fields: [
    { name: 'status', type: 'int' },
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rows', type: { type: 'array', items: ['bytes'] } }
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

const argTypes = {
  echo: [echoArg, echoResp],
  creationCompte: [creationCompte, respBase1]
}
exports.argTypes = argTypes

const types = { synclist }
exports.types = types
