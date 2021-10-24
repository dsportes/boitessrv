const avro = require('avsc')
const crypt = require('./crypto')

avro.types.LongType.__with({
  fromBuffer: buf => crypt.u82big(buf),
  toBuffer: n => crypt.big2u8(n < 0 ? -n : n),
  fromJSON: Number,
  toJSON: Number,
  isValid: n => typeof n === 'bigint',
  compare: (n1, n2) => n1 === n2 ? 0 : (n1 < n2 ? -1 : 1)
})

/*
- `versions` (id) : table des prochains numéros de versions (actuel et dernière sauvegarde) et autres singletons clé / valeur
- `avgrvq` (id) : volumes et quotas d'un avatar ou groupe
- `avrsa` (id) : clé publique d'un avatar

_**Tables aussi persistantes sur le client (IDB)**_

- `compte` (id) : authentification et données d'un compte
- `avatar` (id) : données d'un avatar et liste de ses contacts
- `invitgr` (id, ni) : invitation reçue par un avatar à devenir membre d'un groupe
- `contact` (id, nc) : données d'un contact d'un avatar
- `invitct` (id, ni) : invitation reçue à lier un contact fort avec un autre avatar
- `rencontre` (prh) id : communication par A de son nom complet à un avatar B non connu de A dans l'application
- `parrain` (pph) id : parrainage par un avatar A de la création d'un nouveau compte
- `groupe` (id) : données du groupe et liste de ses avatars, invités ou ayant été pressentis, un jour à être membre.
- `membre` (id, im) : données d'un membre du groupe
- `secret` (id, ns) : données d'un secret d'un avatar ou groupe

*/

const rowAvatar = avro.Type.forSchema({
  name: 'rowAvatar',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk
    { name: 'v', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'vcv', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'cva', type: 'bytes' },
    { name: 'lctk', type: 'bytes' }
  ]
})

const rowAvgrq = avro.Type.forSchema({
  name: 'rowAvgrq',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk
    { name: 'q1', type: 'long' },
    { name: 'q2', type: 'long' },
    { name: 'qm1', type: 'long' },
    { name: 'qm2', type: 'long' },
    { name: 'v1', type: 'long' },
    { name: 'v2', type: 'long' },
    { name: 'vm1', type: 'long' },
    { name: 'vm2', type: 'long' }
  ]
})

const rowAvrsa = avro.Type.forSchema({
  name: 'rowAvrsa',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk
    { name: 'clepub', type: 'bytes' }
  ]
})

const rowCompte = avro.Type.forSchema({
  name: 'rowCompte',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'dpbh', type: 'long' }, // index
    { name: 'pcbh', type: 'long' },
    { name: 'kx', type: 'bytes' },
    { name: 'mack', type: 'bytes' },
    { name: 'mmck', type: 'bytes' }
  ]
})

const rowContact = avro.Type.forSchema({
  name: 'rowContact',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk 1
    { name: 'ic', type: 'int' }, // pk 2
    { name: 'v', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'q1', type: 'long' },
    { name: 'q2', type: 'long' },
    { name: 'qm1', type: 'long' },
    { name: 'qm2', type: 'long' },
    { name: 'ardc', type: 'bytes' },
    { name: 'icbc', type: 'bytes' },
    { name: 'datak', type: 'bytes' }
  ]
})

const rowGroupe = avro.Type.forSchema({
  name: 'rowGroupe',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'cvg', type: ['null', 'bytes'] },
    { name: 'mcg', type: ['null', 'bytes'] },
    { name: 'lstmg', type: ['null', 'bytes'] }
  ]
})

const rowInvitct = avro.Type.forSchema({
  name: 'rowInvitct',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk1
    { name: 'ni', type: 'int' }, // pk2
    { name: 'v', type: 'int' },
    { name: 'dlv', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'datap', type: ['null', 'bytes'] },
    { name: 'datak', type: ['null', 'bytes'] },
    { name: 'ardc', type: ['null', 'bytes'] }
  ]
})

const rowInvitgr = avro.Type.forSchema({
  name: 'rowInvitgr',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk1
    { name: 'ni', type: 'int' }, // pk2
    { name: 'v', type: 'int' },
    { name: 'dlv', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'datap', type: ['null', 'bytes'] },
    { name: 'datak', type: ['null', 'bytes'] }
  ]
})

const rowMembre = avro.Type.forSchema({
  name: 'rowMembre',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk 1
    { name: 'im', type: 'int' }, // pk 2
    { name: 'v', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'dlv', type: 'int' },
    { name: 'datag', type: ['null', 'bytes'] },
    { name: 'ardg', type: ['null', 'bytes'] },
    { name: 'lmck', type: ['null', 'bytes'] }
  ]
})

const rowParrain = avro.Type.forSchema({
  name: 'rowParrain',
  type: 'record',
  fields: [
    { name: 'pph', type: 'long' }, // pk
    { name: 'id', type: 'long' },
    { name: 'nc', type: 'int' },
    { name: 'dlv', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'q1', type: 'long' },
    { name: 'q2', type: 'long' },
    { name: 'qm1', type: 'long' },
    { name: 'qm2', type: 'long' },
    { name: 'datak', type: ['null', 'bytes'] },
    { name: 'datax', type: ['null', 'bytes'] },
    { name: 'ardc', type: ['null', 'bytes'] }
  ]
})

const rowRencontre = avro.Type.forSchema({
  name: 'rowRencontre',
  type: 'record',
  fields: [
    { name: 'prh', type: 'long' }, // pk
    { name: 'id', type: 'long' },
    { name: 'v', type: 'int' },
    { name: 'dlv', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'datak', type: ['null', 'bytes'] },
    { name: 'nomcx', type: ['null', 'bytes'] }
  ]
})

const rowSecret = avro.Type.forSchema({
  name: 'rowSecret',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk1
    { name: 'ns', type: 'int' }, // pk2
    { name: 'ic', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'txts', type: ['null', 'bytes'] },
    { name: 'mcs', type: ['null', 'bytes'] },
    { name: 'aps', type: ['null', 'bytes'] },
    { name: 'dups', type: ['null', 'bytes'] }
  ]
})

const rowVersions = avro.Type.forSchema({
  name: 'rowVersions',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' }, // pk
    { name: 'v', type: 'bytes' }
  ]
})

const rowCv = avro.Type.forSchema({
  name: 'rowCv',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'vcv', type: 'int' },
    { name: 'st', type: 'int' }, // négatif, avatar supprimé / disparu, 0:OK, 1:alerte
    { name: 'phinf', type: ['null', 'bytes'], default: null }
  ]
})

const rowSchemas = {
  avatar: rowAvatar,
  avgrq: rowAvgrq,
  avrsa: rowAvrsa,
  compte: rowCompte,
  contact: rowContact,
  groupe: rowGroupe,
  invitct: rowInvitct,
  invitgr: rowInvitgr,
  membre: rowMembre,
  parrain: rowParrain,
  rencontre: rowRencontre,
  secret: rowSecret,
  versions: rowVersions,
  cv: rowCv
}
exports.rowSchemas = rowSchemas

function toBuffer (table, obj) {
  return rowSchemas[table].toBuffer(obj)
}
exports.toBuffer = toBuffer

function fromBuffer (table, buf) {
  return rowSchemas[table].fromBuffer(buf)
}
exports.fromBuffer = fromBuffer

function newItem (table, row) {
  const item = { table: table }
  if (row.id) item.id = crypt.id2s(row.id)
  item.serial = rowSchemas[table].toBuffer(row)
  return item
}
exports.newItem = newItem

function deserialItem (item) {
  const type = rowSchemas[item.table]
  item.row = type.fromBuffer(item.serial)
  return item
}
exports.deserialItem = deserialItem
