const avro = require('avsc')

const version = '1'
exports.version = version

const rowitem = avro.Type.forSchema({
  name: 'rowitem',
  type: 'record',
  fields: [
    { name: 'table', type: 'string' },
    { name: 'syncid', type: 'string' },
    { name: 'row', type: ['null', 'bytes'], default: null }
  ]
})

const synclist = avro.Type.forSchema({
  name: 'synclist',
  type: 'record',
  fields: [
    { name: 'status', type: 'int' },
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rowitems', type: { type: 'array', items: [rowitem] } }
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

const conn1Compte = avro.Type.forSchema({
  name: 'conn1Compte',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'pcbsh', type: 'long' },
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
    { name: 'rows', type: { type: 'array', items: ['bytes'] } }
  ]
})

const argTypes = {
  testconnexion: [conn1Compte, respBase1],
  echo: [echoArg, echoResp]
}
exports.argTypes = argTypes

const types = { synclist }
exports.types = types
