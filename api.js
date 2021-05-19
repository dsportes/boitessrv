const avro = require('avsc')
const crypt = require('./crypto')
const JSONbig = require('json-bigint')

const version = '1'
exports.version = version

const bigint = avro.types.LongType.__with({
  fromBuffer: buf => crypt.u82big(buf),
  toBuffer: n => crypt.big2u8(n < 0 ? -n : n),
  fromJSON: Number,
  toJSON: Number,
  isValid: n => typeof n === 'bigint',
  compare: (n1, n2) => n1 === n2 ? 0 : (n1 < n2 ? -1 : 1)
})

const echo = avro.Type.forSchema({
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

const idbCompte = avro.Type.forSchema({
  name: 'idbCompte',
  type: 'record',
  fields: [
    { name: 'dhc', type: 'int' },
    { name: 'pcbs', type: 'bytes' },
    { name: 'k', type: 'bytes' },
    { name: 'idx', type: bigint },
    { name: 'mcs', type: { type: 'map', values: 'string' } },
    { name: 'avatars', type: { type: 'array', items: 'string' } }
  ]
})

const types = { echo, echoResp, idbCompte }
exports.types = types

async function testdb () {
  const c1 = {
    dhc: 123,
    pcbs: crypt.random(4),
    k: crypt.random(32),
    // idx: 456n,
    idx: 999007199254740991n,
    mcs: { 1: 'toto', 2: 'juju' },
    avatars: ['toto', 'titi']
  }

  console.log(c1.idx)
  console.log(JSONbig.stringify(c1))
  const buf = types.idbCompte.toBuffer(c1)
  const c2 = types.idbCompte.fromBuffer(buf)
  console.log(JSONbig.stringify(c2))
  console.log(c2.idx)
}
exports.testdb = testdb
