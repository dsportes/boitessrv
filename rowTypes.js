const schemas = require('./schemas')

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

schemas.forSchema({
  name: 'rowavatar',
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

schemas.forSchema({
  name: 'rowavgrq',
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

schemas.forSchema({
  name: 'rowavrsa',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk
    { name: 'clepub', type: 'bytes' }
  ]
})

schemas.forSchema({
  name: 'rowcompte',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk
    { name: 'v', type: 'int' },
    { name: 'dds', type: 'int' },
    { name: 'dpbh', type: 'long' }, // index
    { name: 'pcbh', type: 'long' },
    { name: 'kx', type: 'bytes' },
    { name: 'mack', type: 'bytes' },
    { name: 'mmck', type: 'bytes' },
    { name: 'memok', type: ['null', 'bytes'] }
  ]
})

schemas.forSchema({
  name: 'rowcontact',
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
    { name: 'vsd', type: 'int' },
    { name: 'datak', type: 'bytes' }
  ]
})

schemas.forSchema({
  name: 'rowgroupe',
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

schemas.forSchema({
  name: 'rowinvitct',
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

schemas.forSchema({
  name: 'rowinvitgr',
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

schemas.forSchema({
  name: 'rowmembre',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk 1
    { name: 'im', type: 'int' }, // pk 2
    { name: 'v', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'dlv', type: 'int' },
    { name: 'vsd', type: 'int' },
    { name: 'datag', type: ['null', 'bytes'] },
    { name: 'ardg', type: ['null', 'bytes'] },
    { name: 'lmck', type: ['null', 'bytes'] }
  ]
})

schemas.forSchema({
  name: 'rowparrain',
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

schemas.forSchema({
  name: 'rowrencontre',
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

schemas.forSchema({
  name: 'rowsecret',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' }, // pk1
    { name: 'ns', type: 'int' }, // pk2
    { name: 'ic', type: 'int' },
    { name: 'v', type: 'int' },
    { name: 'st', type: 'int' },
    { name: 'txts', type: ['null', 'bytes'] },
    { name: 'mcs', type: ['null', 'bytes'] },
    { name: 'vsd', type: 'int' },
    { name: 'aps', type: ['null', 'bytes'] },
    { name: 'dups', type: ['null', 'bytes'] }
  ]
})

schemas.forSchema({
  name: 'rowversions',
  type: 'record',
  fields: [
    { name: 'id', type: 'int' }, // pk
    { name: 'v', type: 'bytes' }
  ]
})

schemas.forSchema({
  name: 'rowcv',
  type: 'record',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'vcv', type: 'int' },
    { name: 'st', type: 'int' }, // négatif, avatar supprimé / disparu, 0:OK, 1:alerte
    { name: 'phinf', type: ['null', 'bytes'], default: null }
  ]
})
