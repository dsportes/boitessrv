const avro = require('avsc')
const crypt = require('./crypto')
const JSONbig = require('json-bigint')

const version = '1'
exports.version = version

// eslint-disable-next-line no-unused-vars
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

/*
_**Tables aussi persistantes sur le client (IDB)**_

`compte` (idc) : authentification et données d'un compte
`avgrcv` (id) : carte de visite d'un avatar ou groupe
`avidc1` (ida) : identifications et clés c1 des contacts d'un avatar
`avcontact` (ida, nc) : données d'un contact d'un avatar
`avinvit` () (idb) : invitation adressée à B à lier un contact avec A
`parrain` (dpbh) : offre de parrainage d'un avatar A pour la création d'un compte inconnu
`rencontre` (dpbh) : communication par A de son identifications complète à un compte inconnu
`grlmg` (idg) : liste des id + nc + c1 des membres du groupe
`grmembre` (idg, nm) : données d'un membre du groupe
`grinvit` () (idm) : invitation à M à devenir membre d'un groupe
`secret` (ids) : données d'un secret
`avsecret` (ida, idcs) : aperçu d'un secret pour un avatar (ou référence de son groupe)

*/

/* Compte ___________________________________________________ */
const avc = avro.Type.forSchema({ // map des avatars du compte
  name: 'avc',
  type: 'record',
  fields: [
    { name: 'cle', type: 'bytes' },
    { name: 'pseudo', type: 'string' },
    { name: 'cpriv', type: 'bytes' }
  ]
})

const mavc = avro.Type.forSchema({ // map des avatars du compte
  type: 'map',
  values: avc
})

const mmc = avro.Type.forSchema({ // map des avatars du compte
  type: 'map',
  values: 'string'
})

const idbCompte = avro.Type.forSchema({
  name: 'idbCompte',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'v', type: 'int' },
    { name: 'dpbh', type: 'long' },
    { name: 'pcbsh', type: 'long' },
    { name: 'k', type: 'bytes' },
    { name: 'mmc', type: mmc },
    { name: 'mavc', type: mavc }
  ]
})

const sqlCompte = avro.Type.forSchema({
  name: 'sqlCompte',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'v', type: 'int' },
    { name: 'dpbh', type: 'long' },
    { name: 'pcbsh', type: 'long' },
    { name: 'k', type: 'bytes' },
    { name: 'mmc', type: 'bytes' },
    { name: 'mavc', type: 'bytes' }
  ]
})

const conn1Compte = avro.Type.forSchema({
  name: 'conn1Compte',
  type: 'record',
  fields: [
    { name: 'pcbsh', type: 'long' },
    { name: 'dpbh', type: 'long' }
  ]
})

const respBase1 = avro.Type.forSchema({
  name: 'respBase1',
  type: 'record',
  fields: [
    { name: 'status', type: 'int' },
    { name: 'rows', type: { type: 'array', items: [sqlCompte] } }
  ]
})

const argTypes = { 
  testconnexion: [conn1Compte, respBase1] 
}
exports.argTypes = argTypes

const types = { echo, echoResp, idbCompte, sqlCompte, mmc, mavc }
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
