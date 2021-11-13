const crypt = require('./crypto.js')
const getSession = require('./session.js').getSession
const now = require('nano-time')
const avro = require('avsc')
const api = require('./api.js')
const AppExc = require('./api.js').AppExc
const rowTypes = require('./rowTypes.js')

const VERSIONS = 1

// eslint-disable-next-line no-unused-vars
const dev = process.env.NODE_ENV === 'development'
const nbVersions = 100
const defautVersions = new Array(nbVersions)
for (let i = 0; i < nbVersions; i++) { defautVersions[i] = 0 }

const valueTypes = {
  0: { type: 'json', defaut: '{}' },
  1: { type: avro.Type.forSchema({ type: 'array', items: 'int' }), defaut: defautVersions }
}

function sleep (delai) {
  if (delai <= 0) return
  return new Promise((resolve) => { setTimeout(() => resolve(), delai) })
}

/*
Initialisation du module APRES que le serveur ait été créé et soit opérationnel
Rafraîchissement périodique en cache (si demandé et seulement pour la production) de la liste des aricles à peser
afin que les balances aient plus rapidement la réponse en cas de changement dans Odoo
*/
function atStart(/* cfg */) {
  console.log('m1 start')
}
exports.atStart = atStart

/***************************************************************
Appel de l'opération
    cfg : configuration relative au code de l'organisation    
    args : objet des arguments
Retourne un objet result :node -version

    result.type : type mime
    result.bytes : si le résultat est du binaire
Pour un POST :
    OK : result : objet résultat à sérialiser - HTTP status 200

Exception : 
    AppExc : AppExc sérialisé en JSON
        code api.F_SRV - erreur fonctionnelle à retourner par l'application
            HTTP status 400
        code api.X_SRV - erreur fonctionnelle à émettre en exception à l'application
            HTTP status 401                   
    Non transformée en AppExc : Création d'un AppExc avec E_SRV sérialisé en JSON
        HTTP status 402
*****************************************************************/

async function echo (cfg, args, isGet) {
  if (args.to) {
    await sleep(args.to * 1000)
  }
  if (!args) args = { a: 1, b: 'toto' }
  args.org = cfg.code || 'org'
  return !isGet ? args : { type:'text/plain', bytes:Buffer.from(JSON.stringify(args), 'utf8') }
}
exports.echo = echo

async function erreur (cfg, args) {
  if (args.to) {
    await sleep(args.to * 1000)
  }
  throw new AppExc(args.code, args.message)
}
exports.erreur = erreur

async function pingdb (cfg) {
  stmt(cfg, selvalues).get({ id: 1 })
  return { dhc: getdhc() }
}
exports.pingdb = pingdb

/*
function decryptDatax(cle, datax) {
    const x = crypt.decrypter(cle, Buffer.from(datax, 'base64'))
    const y = x.toString('utf8')
    return JSON.parse(y)
}

function cryptDatax(cle, datax) {
    const j = JSON.stringify(datax)
    return [j, base64url(crypt.crypter(cle, Buffer.from(j, 'utf8')))]
}
*/

function getdhc() {
  return parseInt(now.micro(), 10)
}

class Dds {
  constructor () {
    this.j0 = Math.floor(new Date('2020-01-01T00:00:00').getTime() / 86400000)
  }
  
  // jour courant (nombre de jours écoulés) depuis le 1/1/2020
  jourJ () {
    return Math.floor(new Date().getTime() / 86400000) - this.j0
  }

  /* 
  Si la dds actuelle du compte n'a pas plus de 28 jours, elle convient encore.
  Sinon il faut en réattribuer une qui ait entre 14 et 28 jours d'âge.
  */
  ddsc (dds) {
    const j = this.jourJ()
    return ((j - dds) > 28) ? j - 14 - Math.floor(Math.random() * 14) : dds
  }

  /* 
  Si la dds actuelle de l'avatar ou du groupe n'a pas plus de 14 jours, elle convient encore.
  Sinon il faut en réattribuer une qui ait entre 0 et 14 d'âge.
  */
  ddsag (dds) {
    const j = this.jourJ()
    return ((j - dds) > 14) ? j - Math.floor(Math.random() * 14) : dds
  }
}
const dds = new Dds()

/* Mois courant depuis janvier 2020 */
// eslint-disable-next-line no-unused-vars
function getMois () {
  const d = new Date()
  const an = (d.getUTCFullYear() % 100) - 20
  const mo = d.getUTCMonth()
  return ( (an * 12) + mo)
}

/******************************************/
const cachestmt = { }

function stmt (cfg, sql) {
  let c = cachestmt[cfg.code]
  if (!c) { c = {}; cachestmt[cfg.code] = c }
  if (!c[sql])
    try {
      c[sql] = cfg.db.prepare(sql)
    } catch (e) {
      console.log(e.toString())
    }
  return c[sql]
}

/******************************************/
const selvalues = 'SELECT v FROM versions WHERE id = @id'
const insvalues = 'INSERT INTO versions (id, v) VALUES (@id, @v)'
const updvalues = 'UPDATE versions SET v = @v WHERE id = @id'

const cacheValues = { }

function getValue (cfg, n) {
  let cache = cacheValues[cfg.code]
  if (!cache) {
    cache = {}
    cacheValues[cfg.code] = cache
  }
  if (cache[n]) return cache[n]
  const t = valueTypes[n]
  let value
  const res = stmt(cfg, selvalues).get({ id: n })
  let bin = res ? res.v : null
  if (bin) {
    value = t.type === 'json' ? JSON.parse(Buffer.from(bin).toString()) : t.type.fromBuffer(bin)
  } else {
    value = t.defaut
    bin = t.type === 'json' ? Buffer.from(value) : t.type.toBuffer(value)
    stmt(cfg, insvalues).run({ id: n, v: bin })
  }
  cache[n] = value
  return value
}

function setValue (cfg, n) {
  const t = valueTypes[n]
  const value = cacheValues[cfg.code][n]
  const bin = t.type === 'json' ? Buffer.from(value) : t.type.toBuffer(value)
  stmt(cfg, updvalues).run({ id: n, v: bin })
}

/******************************************/
const inscompte = 'INSERT INTO compte (id, v, dds, dpbh, pcbh, kx, mack, mmck) VALUES (@id, @v, @dds, @dpbh, @pcbh, @kx, @mack, @mmck)'
const insavatar = 'INSERT INTO avatar (id, v, st, vcv, dds, cva, lctk) VALUES (@id, @v, @st, @vcv, @dds, @cva, @lctk)'
const insavrsa = 'INSERT INTO avrsa (id, clepub) VALUES (@id, @clepub)'
const insavgrvq = 'INSERT INTO avgrvq (id, q1, q2, qm1, qm2, v1, v2, vm1, vm2) VALUES (@id, @q1, @q2, @qm1, @qm2, @v1, @v2, @vm1, @vm2)'
const selcomptedpbh = 'SELECT * FROM compte WHERE dpbh = @dpbh'

function idx (id) {
  return (id % (nbVersions - 1)) + 1
}

/* Creation de compte sans parrain
args: 
  name: 'creationCompte',
  type: 'record',
  fields: [
    { name: 'sessionId', type: 'string' },
    { name: 'mdp64', type: 'string' },
    { name: 'dpbh', type: 'long' },
    { name: 'q1', type: 'int' },
    { name: 'q2', type: 'int' },
    { name: 'qm1', type: 'int' },
    { name: 'qm2', type: 'int' },
    { name: 'clePub', type: 'bytes' },
    { name: 'rowCompte', type: 'bytes' },
    { name: 'rowAvatar', type: 'bytes' }
  ]
Retour :
  name: 'respBase1',
  type: 'record',
  fields: [
    { name: 'status', type: 'int' },
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rows', type: { type: 'array', items: ['bytes'] } }
  ]
*/
function creationCompte (cfg, args) {  
  const result = { sessionId: args.sessionId, dh: getdhc() }
  if (cfg.cle !== args.mdp64) {
    throw new AppExc(api.X_SRV, 'Mot de passe de l\'organisation non reconnu. Pour créer un compte privilégié, le mot de passe de l\'organisation est requis')
  }
  const session = getSession(args.sessionId)
  const compte = rowTypes.fromBuffer('compte', args.rowCompte)
  const avatar = rowTypes.fromBuffer('avatar', args.rowAvatar)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(compte.id)
  versions[j]++
  compte.v = versions[j]
  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j]
  setValue(cfg, VERSIONS)

  compte.dds = dds.ddsc(compte.dds)
  avatar.dds = dds.ddsag(avatar.dds)
  const avrsa = { id: avatar.id, clepub: args.clePub }
  const avgrvq = { id: avatar.id, q1: args.q1, q2: args.q2, qm1: args.qm1, qm2:args.qm2, v1: 0, v2:0, vm1:0, vm2: 0 }

  cfg.db.transaction(creationCompteTr)(cfg, session, compte, avatar, avrsa, avgrvq)

  result.rowItems = [ rowTypes.newItem('compte', compte), rowTypes.newItem('avatar', avatar) ]    
  return result
}
exports.creationCompte = creationCompte

function creationCompteTr (cfg, session, compte, avatar, avrsa, avgrvq) {
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
  if (c) {
    if (c.pcbh === compte.pcbh) {
      throw new AppExc(api.X_SRV, 'Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(api.X_SRV, 'Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
    }
  }
  stmt(cfg, inscompte).run({ ...compte })
  stmt(cfg, insavatar).run({ ...avatar })
  stmt(cfg, insavrsa).run(avrsa)
  stmt(cfg, insavgrvq).run(avgrvq)
  session.setCompteId(compte.id)
  session.setAvatarId(avatar.id)
  session.setCvId(avatar.id)
}

/******************************************
Détermine si les hash de la phrase secrète en argument correspond à un compte.
args = { dpbh, pcbh }
Retour = compte
*/
async function connexionCompte (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: args.dpbh })
  if (!c || (c.pcbh !== args.pcbh)) {
    throw new AppExc(api.X_SRV, 'Compte non authentifié : aucun compte n\'est déclaré avec cette phrase secrète')
  }
  const it = rowTypes.newItem('compte', c)
  // const it2 = rowTypes.deserialItem(it)
  result.rowItems = [ it ]
  return result
}
exports.connexionCompte = connexionCompte

/*****************************************
Chargement des rows d'un avatar 
    { name: 'sessionId', type: 'string' },
    { name: 'avgr', type: 'long' },
    { name: 'lv', type: arrayIntType } 7 compteurs pour les versions des 7 tables
*/

const selsecret = 'SELECT * FROM secret WHERE id = @id AND v > @v'
const selinvitgr = 'SELECT * FROM invitgr WHERE id = @id AND v > @v'
const selavatar = 'SELECT * FROM avatar WHERE id = @id AND v > @v'
const selcontact = 'SELECT * FROM contact WHERE id = @id AND v > @v'
const selinvitct = 'SELECT * FROM invitct WHERE id = @id AND v > @v'
const selrencontre = 'SELECT * FROM rencontre WHERE id = @id AND v > @v'
const selparrain = 'SELECT * FROM parrain WHERE id = @id AND v > @v'
const selgroupe = 'SELECT * FROM groupe WHERE id = @id AND v > @v'
const selmembre = 'SELECT * FROM membre WHERE id = @id AND v > @v'

async function syncAv (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  const id = args.avgr
  /*
  for (const row of stmt(cfg, selinvitgr).iterate({ id, v: args.lv[api.INVITGR] })) {
    rowItems.push(rowTypes.newItem('invitgr', row))
  }
  */
  for (const row of stmt(cfg, selavatar).iterate({ id, v: args.lv[api.AVATAR] })) {
    rowItems.push(rowTypes.newItem('avatar', row))
  }
  for (const row of stmt(cfg, selcontact).iterate({ id, v: args.lv[api.CONTACT] })) {
    rowItems.push(rowTypes.newItem('contact', row))
  }
  for (const row of stmt(cfg, selinvitct).iterate({ id, v: args.lv[api.INVITCT] })) {
    rowItems.push(rowTypes.newItem('invitvt', row))
  }
  for (const row of stmt(cfg, selrencontre).iterate({ id, v: args.lv[api.RENCONTRE] })) {
    rowItems.push(rowTypes.newItem('rencontre', row))
  }
  for (const row of stmt(cfg, selparrain).iterate({ id, v: args.lv[api.PARRAIN] })) {
    rowItems.push(rowTypes.newItem('parrain', row))
  }
  for (const row of stmt(cfg, selsecret).iterate({ id, v: args.lv[api.SECRET] })) {
    rowItems.push(rowTypes.newItem('secret', row))
  }
  result.rowItems = rowItems
  return result
}
exports.syncAv = syncAv

/*****************************************/
async function syncGr (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  const id = args.avgr
  /*
  for (const row of stmt(cfg, selinvitgr).iterate({ id, v: args.lv[api.INVITGR] })) {
    rowItems.push(rowTypes.newItem('invitgr', row))
  }
  */
  for (const row of stmt(cfg, selgroupe).iterate({ id, v: args.lv[api.GROUPE] })) {
    rowItems.push(rowTypes.newItem('groupe', row))
  }
  for (const row of stmt(cfg, selmembre).iterate({ id, v: args.lv[api.MEMBRE] })) {
    rowItems.push(rowTypes.newItem('membre', row))
  }
  for (const row of stmt(cfg, selsecret).iterate({ id, v: args.lv[api.SECRET] })) {
    rowItems.push(rowTypes.newItem('secret', row))
  }
  result.rowItems = rowItems
  return result
}
exports.syncGr = syncGr

/*****************************************
Chargement des rows invitgr de la liste fournie
{ name: 'sessionId', type: 'string' },
{ name: 'lvav', type: mapIntType } key: sid de l'avatar, value: version
*/
async function syncInvitgr (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  args.lvav.forEach((sid, v) => {
    const id = crypt.id2n(sid)
    for (const row of stmt(cfg, selinvitgr).iterate({ id, v })) {
      rowItems.push(rowTypes.newItem('invitgr', row))
    }
  })
  result.rowItems = rowItems
  return result
}
exports.syncInvitgr = syncInvitgr

/******************************************
Abonnement de la session aux compte et listes d'avatars et de groupes et signatures
    { name: 'sessionId', type: 'string' },
    { name: 'idc', type: 'long' },
    { name: 'lav', type: arrayLongType },
    { name: 'lgr', type: arrayLongType }
*/
async function syncAbo (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const session = getSession(args.sessionsId)
  if (args.idc) session.compteId = args.idc
  session.avatarsIds = args.lav
  session.groupesIds = args.lgr

  if (args.idc) {
    cfg.db.transaction(signaturesTr)(cfg, args.idc, args.lav, args.lgr)
  }
  return result
}

const updddsc = 'UPDATE compte SET dds = @dds WHERE id = @id'
const updddsa= 'UPDATE avatar SET dds = @dds WHERE id = @id'
const updddsg = 'UPDATE groupe SET dds = @dds WHERE id = @id'
const ddsc = 'SELECT dds FROM compte WHERE id = @id'
const ddsa = 'SELECT dds FROM avatar WHERE id = @id'
const ddsg = 'SELECT dds FROM groupe WHERE id = @id'

function signaturesTr (cfg, idc, lav, lgr) {
  const a = stmt(cfg, ddsc).get({ id: idc })
  const n = dds.ddsc(a)
  if (a > n) stmt(cfg, updddsc).run({ id: idc, dds:a })

  lav.forEach((id) => {
    const a = stmt(cfg, ddsa).get({ id: id })
    const n = dds.ddsag(a)
    if (a > n) stmt(cfg, updddsa).run({ id: id, dds: a })
  })

  lgr.forEach((id) => {
    const a = stmt(cfg, ddsg).get({ id: id })
    const n = dds.ddsag(a)
    if (a > n) stmt(cfg, updddsg).run({ id: id, dds: a })
  })
}
exports.syncAbo = syncAbo

/******************************************
Chargement des CVs :
- celles de lcvmaj si changées après vcv
- celles de lcvchargt sans filtre de version
Abonnement de l'union des deux listes
    { name: 'sessionId', type: 'string' },
    { name: 'vcv', type: 'int' },
    { name: 'lcvmaj', type: arrayIntType },
    { name: 'lcvchargt', type: arrayIntType }
*/
const selcv1 = 'SELECT id, vcv, st, phinf FROM avatar WHERE id IN @lid AND vcv > @vcv'
const selcv2 = 'SELECT id, vcv, st, phinf FROM avatar WHERE id IN @lid'

async function chargtCVs (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const session = getSession(args.sessionsId)
  session.cvsIds = args.lcvmaj.concat(args.lcvchargt)
  const rowItems = []

  let lst = []
  if (args.lcvmaj.length) {
    args.lcvmaj.forEach((sid) => { lst.push('' + crypt.id2n(sid)) })
    const lid = '(' + lst.join(',') + ')'
    for (const row of stmt(cfg, selcv1).iterate({ lid, vcv: args.vcv})) {
      rowItems.push(rowTypes.newItem('cv', row))
    }
  }
  
  lst = []
  if (args.lcvchargt.length) {
    args.lcvchargt.forEach((sid) => { lst.push('' + crypt.id2n(sid)) })
    const lid = '(' + lst.join(',') + ')'
    for (const row of stmt(cfg, selcv2).iterate({ lid })) {
      rowItems.push(rowTypes.newItem('cv', row))
    }
  }

  result.rowItels = rowItems
  return result
}
exports.chargtCVs = chargtCVs

/******************************************/
const bytes0 = new Uint8Array(0)
const selcv = 'SELECT id, st, vcv, cva FROM avatar WHERE id = @id'
async function getcv (cfg, args) {
  try {
    const c = stmt(cfg, selcv).get({ id: crypt.id2n(args.sid) })
    if (!c) return { bytes0 }
    const buf = rowTypes.rowSchemas.cv.toBuffer(c)
    // const obj = rowTypes.rowSchemas.cv.fromBuffer(buf)
    return { bytes: buf }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
exports.getcv = getcv

/******************************************/
const selavrsapub = 'SELECT clepub FROM avrsa WHERE id = @id'
async function getclepub (cfg, args) {
  try {
    const c = stmt(cfg, selavrsapub).get({ id: crypt.id2n(args.sid) })
    if (!c) return { bytes0 }
    return { bytes: c.clepub }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
exports.getclepub = getclepub
