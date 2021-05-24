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
    { name: 'id', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'dpbh', type: 'int' },
    { name: 'pcbs', type: 'bytes' },
    { name: 'k', type: 'bytes' },
    { name: 'mcs', type: { type: 'map', values: 'string' } },
    { name: 'avatars', type: { type: 'array', items: 'string' } }
  ]
})

const sqlCompte = avro.Type.forSchema({
  name: 'idbCompte',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'dpbh', type: 'int' },
    { name: 'pcbsh', type: 'int' },
    { name: 'kx', type: 'bytes' },
    { name: 'datak', type: 'bytes' }
  ]
})

const idbC = avro.Type.forSchema({
  name: 'idbC',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'lck', type: 'bytes' },
    { name: 'lmk', type: 'bytes' }
  ]
})

const idbM = avro.Type.forSchema({ // à écrire
  name: 'idbM',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'lck', type: 'bytes' },
    { name: 'lmk', type: 'bytes' }
  ]
})

const idbDctr = avro.Type.forSchema({
  name: 'idbDctr',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'dlv', type: 'int' },
    { name: 'clepub', type: 'bytes' }
  ]
})

const idbInvgr = avro.Type.forSchema({
  name: 'idbInvgr',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'idm', type: bigint },
    { name: 'dlv', type: 'int' },
    { name: 'cleidpub', type: 'bytes' }
  ]
})

const sqlCext = avro.Type.forSchema({
  name: 'sqlCext',
  type: 'record',
  fields: [
    { name: 'dpbh', type: 'int' }
    /* à compléter */
  ]
})

const idbAvatar = avro.Type.forSchema({
  name: 'idbAvatar',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'nc', type: 'string' },
    { name: 'contacts', type: { type: 'map', values: idbC } },
    { name: 'membres', type: { type: 'map', values: idbM } },
    { name: 'dctr', type: { type: 'map', values: idbDctr } },
    { name: 'invgr', type: { type: 'map', values: idbInvgr } },
    { name: 'cext', type: { type: 'map', values: sqlCext } }
  ]
})

const sqlAvatar = avro.Type.forSchema({
  name: 'sqlAvatar',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'lck', type: 'bytes' },
    { name: 'lmk', type: 'bytes' }
  ]
})

const conn1Compte = avro.Type.forSchema({
  name: 'conn1Compte',
  type: 'record',
  fields: [
    { name: 'dpbh', type: 'int' },
    { name: 'pcbs', type: 'bytes' }
  ]
})

const conn1CompteResp = avro.Type.forSchema({
  name: 'conn1CompteResp',
  type: 'record',
  fields: [
    { name: 'status', type: 'int' },
    { name: 'rows', type: { type: 'array', items: [sqlCompte, sqlAvatar] } }
  ]
})

const types = { echo, echoResp, idbCompte, sqlCompte, conn1Compte, conn1CompteResp, idbAvatar, sqlAvatar }
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
