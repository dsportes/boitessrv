import { crypt } from './crypto.mjs'
import { getdhc, sleep, dds, deserial, serial } from './util.mjs'
import { getSession, syncListQueue, processQueue } from './session.mjs'
import { AppExc, X_SRV, INDEXT } from './api.mjs'
import { schemas } from './schemas.mjs'

export const m1fonctions = { }
const MO = 1024 * 1024
const VERSIONS = 1

// eslint-disable-next-line no-unused-vars
const dev = process.env.NODE_ENV === 'development'
const nbVersions = 100
const defautVersions = new Array(nbVersions)
for (let i = 0; i < nbVersions; i++) { defautVersions[i] = 0 }

const valueTypes = {
  0: { type: 'json', defaut: '{}' },
  1: { defaut: defautVersions }
}

/*
Initialisation du module APRES que le serveur ait été créé et soit opérationnel
Rafraîchissement périodique en cache (si demandé et seulement pour la production) de la liste des aricles à peser
afin que les balances aient plus rapidement la réponse en cas de changement dans Odoo
*/
function atStart(/* cfg */) {
  console.log('m1 start')
}
m1fonctions.atStart = atStart

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
        code F_SRV - erreur fonctionnelle à retourner par l'application
            HTTP status 400
        code X_SRV - erreur fonctionnelle à émettre en exception à l'application
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
m1fonctions.echo = echo

async function erreur (cfg, args) {
  if (args.to) {
    await sleep(args.to * 1000)
  }
  throw new AppExc(args.code, args.message)
}
m1fonctions.erreur = erreur

async function pingdb (cfg) {
  stmt(cfg, selvalues).get({ id: 1 })
  return { dhc: getdhc() }
}
m1fonctions.pingdb = pingdb

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
    value = t.type === 'json' ? JSON.parse(Buffer.from(bin).toString()) : deserial(bin)
  } else {
    value = t.defaut
    bin = t.type === 'json' ? Buffer.from(value) : serial(value)
    stmt(cfg, insvalues).run({ id: n, v: bin })
  }
  cache[n] = value
  return value
}

function setValue (cfg, n) {
  const t = valueTypes[n]
  const value = cacheValues[cfg.code][n]
  const bin = t.type === 'json' ? Buffer.from(value) : serial(value)
  stmt(cfg, updvalues).run({ id: n, v: bin })
}

/******************************************/
function newItem (table, row) {
  const item = { table: table }
  if (row.id) item.id = row.id
  item.serial = schemas.serialize('row' + table, row)
  return item
}

/******************************************/
const inscompte = 'INSERT INTO compte (id, v, dds, dpbh, pcbh, kx, mack, mmck, memok) VALUES (@id, @v, @dds, @dpbh, @pcbh, @kx, @mack, @mmck, @memok)'
const insavatar = 'INSERT INTO avatar (id, v, st, vcv, dds, cva, lctk) VALUES (@id, @v, @st, @vcv, @dds, @cva, @lctk)'
const insavrsa = 'INSERT INTO avrsa (id, clepub) VALUES (@id, @clepub)'
const selavgrvqid = 'SELECT * FROM avgrvq WHERE id = @id'
const insavgrvq = 'INSERT INTO avgrvq (id, q1, q2, qm1, qm2, v1, v2, vm1, vm2) VALUES (@id, @q1, @q2, @qm1, @qm2, @v1, @v2, @vm1, @vm2)'
const updavgrvq = 'UPDATE avgrvq SET q1 = @q1, q2 = @q2, qm1 = @qm1, qm2 = @qm2, v1 = @v1, v2 = @v2, vm1 = @vm1, vm2 = @vm2 WHERE id = @id'
const selcomptedpbh = 'SELECT * FROM compte WHERE dpbh = @dpbh'
const selcompteid = 'SELECT * FROM compte WHERE id = @id'
const selavatarid = 'SELECT * FROM avatar WHERE id = @id'
const selsecretidns = 'SELECT * FROM secret WHERE id = @id AND ns = @ns'

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
    { name: 'sessionId', type: 'string' },
    { name: 'dh', type: 'long' },
    { name: 'rows', type: { type: 'array', items: ['bytes'] } }
  ]
*/
function creationCompte (cfg, args) {  
  const result = { sessionId: args.sessionId, dh: getdhc() }
  if (cfg.cle !== args.mdp64) {
    throw new AppExc(X_SRV, 'Mot de passe de l\'organisation non reconnu. Pour créer un compte privilégié, le mot de passe de l\'organisation est requis')
  }
  const session = getSession(args.sessionId)
  const compte = schemas.deserialize('rowcompte', args.rowCompte)
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(compte.id)
  versions[j]++
  compte.v = versions[j]

  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j]
  setValue(cfg, VERSIONS)

  compte.dds = dds.ddsc(0)
  avatar.dds = dds.ddsag(0)
  const avrsa = { id: avatar.id, clepub: args.clePub }
  const avgrvq = { id: avatar.id, q1: args.q1*MO, q2: args.q2*MO, qm1: args.qm1*MO, qm2:args.qm2*MO, v1: 0, v2:0, vm1:0, vm2: 0 }

  cfg.db.transaction(creationCompteTr)(cfg, session, compte, avatar, avrsa, avgrvq)

  result.rowItems = [ newItem('compte', compte), newItem('avatar', avatar) ]    
  return result
}
m1fonctions.creationCompte = creationCompte

function creationCompteTr (cfg, session, compte, avatar, avrsa, avgrvq) {
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
  if (c) {
    if (c.pcbh === compte.pcbh) {
      throw new AppExc(X_SRV, 'Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(X_SRV, 'Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
    }
  }
  stmt(cfg, inscompte).run(compte)
  stmt(cfg, insavatar).run(avatar)
  stmt(cfg, insavrsa).run(avrsa)
  stmt(cfg, insavgrvq).run(avgrvq)
  session.compteId = compte.id
  session.plusAvatars([avatar.id])
}

/***************************************
Enregistrement du memo d'un compte :
Args : 
- sessionId
- id: du compte
- memok : memo crypté par la clé K
Retour :
- sessionId
- dh
Exception : compte inexistant
*/
const updmemokcompte = 'UPDATE compte SET v = @v, memok = @memok WHERE id = @id'

function memoCompte (cfg, args) { 
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  const v = versions[j]

  const rowItems = []

  cfg.db.transaction(memoCompteTr)(cfg, args.id, v, args.memok, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.memoCompte = memoCompte

function memoCompteTr (cfg, id, v, memok, rowItems) {
  const c = stmt(cfg, selcompteid).get({ id: id })
  if (!c) {
    throw new AppExc(X_SRV, 'Compte inexistant. Bug probable.')
  }
  c.memok = memok
  c.v = v
  stmt(cfg, updmemokcompte).run( { memok, v, id })
  rowItems.push(newItem('compte', c))
}

/***************************************
Enregistrement des mots clés d'un compte :
Args : 
- sessionId
- id: du compte
- mmck : map des mots cles cryptée par la clé K
Retour :
- sessionId
- dh
Exception : compte inexistant
*/
const updmmckcompte = 'UPDATE compte SET v = @v, mmck = @mmck WHERE id = @id'

function mmcCompte (cfg, args) { 
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  const v = versions[j]

  const rowItems = []

  cfg.db.transaction(mmcCompteTr)(cfg, args.id, v, args.mmck, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.mmcCompte = mmcCompte

function mmcCompteTr (cfg, id, v, mmck, rowItems) {
  const c = stmt(cfg, selcompteid).get({ id: id })
  if (!c) {
    throw new AppExc(X_SRV, 'Compte inexistant. Bug probable.')
  }
  c.mmck = mmck
  c.v = v
  stmt(cfg, updmmckcompte).run( { mmck, v, id })
  rowItems.push(newItem('compte', c))
}

/***************************************
Enregistrement de la CV d'un avatar :
Args : 
- sessionId
- id: de l'avatar
- phinfo : [ph, info] crtpter par la clé de l'avatar et sérialisé]
Retour :
- sessionId
- dh
Exception : avatar inexistant
*/
const updcvavatar = 'UPDATE avatar SET v = @v, vcv = @vcv, cva = @cva WHERE id = @id'

function cvAvatar (cfg, args) { 
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  const v = versions[j]

  const rowItems = []

  cfg.db.transaction(cvAvatarTr)(cfg, args.id, v, args.phinfo, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.cvAvatar = cvAvatar

function cvAvatarTr (cfg, id, v, cva, rowItems) {
  const a = stmt(cfg, selavatarid).get({ id: id })
  if (!a) {
    throw new AppExc(X_SRV, 'Avatar inexistant. Bug probable.')
  }
  a.cva = cva
  a.v = v
  a.vcv = v
  stmt(cfg, updcvavatar).run( { cva, vcv: v, v, id })
  rowItems.push(newItem('avatar', a))
  // cols: ['id', 'vcv', 'st', 'phinf']
  rowItems.push(newItem('cv', { id: id, vcv: v, st: a.st, phinf: cva }))
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
    throw new AppExc(X_SRV, 'Compte non authentifié : aucun compte n\'est déclaré avec cette phrase secrète')
  }
  const it = newItem('compte', c)
  result.rowItems = [ it ]
  return result
}
m1fonctions.connexionCompte = connexionCompte

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
  let rows
  /*
  rows = stmt(cfg, selinvitgr).all({ id, v: args.lv[INDEXT.INVITGR] })
  rows.forEach((row) => {
    rowItems.push(newItem('invitgr', row))
  })
  */
  rows = stmt(cfg, selavatar).all({ id, v: args.lv[INDEXT.AVATAR] })
  rows.forEach((row) => {
    rowItems.push(newItem('avatar', row))
  })
  rows = stmt(cfg, selcontact).all({ id, v: args.lv[INDEXT.CONTACT] })
  rows.forEach((row) => {
    rowItems.push(newItem('contact', row))
  })
  rows = stmt(cfg, selinvitct).all({ id, v: args.lv[INDEXT.INVITCT] })
  rows.forEach((row) => {
    rowItems.push(newItem('invitvt', row))
  })
  rows = stmt(cfg, selrencontre).all({ id, v: args.lv[INDEXT.RENCONTRE] })
  rows.forEach((row) => {
    rowItems.push(newItem('rencontre', row))
  })
  rows = stmt(cfg, selparrain).all({ id, v: args.lv[INDEXT.PARRAIN] })
  rows.forEach((row) => {
    rowItems.push(newItem('parrain', row))
  })
  rows = stmt(cfg, selsecret).all({ id, v: args.lv[INDEXT.SECRET] })
  rows.forEach((row) => {
    rowItems.push(newItem('secret', row))
  })
  result.rowItems = rowItems
  return result
}
m1fonctions.syncAv = syncAv

/*****************************************/
async function syncGr (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  const id = args.avgr
  let rows = stmt(cfg, selgroupe).all({ id, v: args.lv[INDEXT.GROUPE] })
  rows.forEach((row) => {
    rowItems.push(newItem('groupe', row))
  })
  rows = stmt(cfg, selmembre).all({ id, v: args.lv[INDEXT.MEMBRE] })
  rows.forEach((row) => {
    rowItems.push(newItem('membre', row))
  })
  rows = stmt(cfg, selsecret).all({ id, v: args.lv[INDEXT.SECRET] })
  rows.forEach((row) => {
    rowItems.push(newItem('secret', row))
  })
  result.rowItems = rowItems
  return result
}
m1fonctions.syncGr = syncGr

/*****************************************
Chargement des rows invitgr de la liste fournie
{ name: 'sessionId', type: 'string' },
{ name: 'lvav', type: mapIntType } key: sid de l'avatar, value: version
*/
async function syncInvitgr (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  for(const sid in args.lvav) {
    const v = args.lvav[sid]
    const id = crypt.sidToId(sid)
    const rows = stmt(cfg, selinvitgr).all({ id, v })
    rows.forEach((row) => {
      rowItems.push(newItem('invitgr', row))
    })
  }
  result.rowItems = rowItems
  return result
}
m1fonctions.syncInvitgr = syncInvitgr

/******************************************
Abonnement de la session aux compte et listes d'avatars et de groupes et signatures
    { name: 'sessionId', type: 'string' },
    { name: 'idc', type: 'long' },
    { name: 'lav', type: arrayLongType },
    { name: 'lgr', type: arrayLongType }
*/
async function syncAbo (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const session = getSession(args.sessionId)
  if (args.idc) session.compteId = args.idc
  session.avatarsIds = new Set(args.lav)
  session.groupesIds = new Set(args.lgr)

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
m1fonctions.syncAbo = syncAbo

/******************************************
Chargement des CVs :
- celles de lcvmaj si changées après vcv
- celles de lcvchargt sans filtre de version
Abonnement à l'union des deux listes
    { name: 'sessionId', type: 'string' },
    { name: 'vcv', type: 'int' },
    { name: 'lcvmaj', type: arrayIntType },
    { name: 'lcvchargt', type: arrayIntType }
*/
const selcv1 = 'SELECT id, vcv, st, phinf FROM avatar WHERE id IN @lid AND vcv > @vcv'
const selcv2 = 'SELECT id, vcv, st, phinf FROM avatar WHERE id IN @lid'

async function chargtCVs (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const session = getSession(args.sessionId)
  session.cvsIds = new Set(args.lcvmaj.concat(args.lcvchargt))
  const rowItems = []

  let lst = []
  if (args.lcvmaj.length) {
    args.lcvmaj.forEach((sid) => { lst.push('' + crypt.sidToId(sid)) })
    const lid = '(' + lst.join(',') + ')'
    for (const row of stmt(cfg, selcv1).iterate({ lid, vcv: args.vcv})) {
      rowItems.push(newItem('cv', row))
    }
  }
  
  lst = []
  if (args.lcvchargt.length) {
    args.lcvchargt.forEach((sid) => { lst.push('' + crypt.sidToId(sid)) })
    const lid = '(' + lst.join(',') + ')'
    for (const row of stmt(cfg, selcv2).iterate({ lid })) {
      rowItems.push(newItem('cv', row))
    }
  }

  result.rowItems = rowItems
  return result
}
m1fonctions.chargtCVs = chargtCVs

/*****************************************
getcv : retourne la CV d'un avatar
args : 
-sessionId
-sid de l'avatar
*/
const bytes0 = new Uint8Array(0)
const selcv = 'SELECT id, st, vcv, cva FROM avatar WHERE id = @id'
async function getcv (cfg, args) {
  try {
    const c = stmt(cfg, selcv).get({ id: crypt.sidToId(args.sid) })
    if (!c) return { bytes0 }
    const buf = schemas.serialize('rowcv', c)
    return { bytes: buf }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
m1fonctions.getcv = getcv

/*****************************************
getclepub : retourne la clé publique d'un avatar
args : 
-sessionId
-sid de l'avatar
*/
const selavrsapub = 'SELECT clepub FROM avrsa WHERE id = @id'
async function getclepub (cfg, args) {
  try {
    const c = stmt(cfg, selavrsapub).get({ id: crypt.sidToId(args.sid) })
    if (!c) return { bytes0 }
    return { bytes: c.clepub }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
m1fonctions.getclepub = getclepub

/***************************************
Nouveau secret personnel
Args : 
- sessionId
- rowSecret (v à 0)
Retour :
- sessionId
- dh
Exception : dépassement des quotas 
*/
const inssecret = 'INSERT INTO secret (id, ns, nr, ic, v, st, ora, v1, v2, txts, mcs, mpjs, dups, vsh) ' +
  'VALUES (@id, @ns, @nr, @ic, @v, @st, @ora, @v1, @v2, @txts, @mcs, @mpjs, @dups, @vsh)'

function nouveauSecretP (cfg, args) { 
  const dh = getdhc()
  const secret = schemas.deserialize('rowsecret', args.rowSecret)

  const versions = getValue(cfg, VERSIONS)
  const j = idx(secret.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  secret.v = versions[j]

  cfg.db.transaction(nouveauSecretPTr)(cfg, secret)

  const rowItems = []
  rowItems.push(newItem('secret', secret))

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.nouveauSecretP = nouveauSecretP

function nouveauSecretPTr (cfg, secret) {

  const a = stmt(cfg, selavgrvqid).get({ id: secret.id })
  if (a) {
    if (secret.st === 99999) {
      a.v1 = a.v1 + secret.v1
    } else {
      a.vm1 = a.vm1 + secret.v1
    }
  }
  if (!a || a.v1 > a.q1 || a.vm1 > a.qm1) {
    console.log('Quotas d\'espace insuffisants.')
    // throw new AppExc(X_SRV, 'Quotas d\'espace insuffisants.')
  }
  stmt(cfg, updavgrvq).run(a)
  stmt(cfg, inssecret).run(secret)
}

/***************************************
MAJ secret
Args : 
- sessionId, id, ns, v1, txts, mcs
Retour :
- sessionId
- dh
Exception : dépassement des quotas 
*/
const upd1secret = 'UPDATE secret SET v = @v, v1 = @v1, txts = @txts, mcs = @mcs WHERE id = @id AND ns = @ns'

function maj1SecretP (cfg, args) { 
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  args.v = versions[j]
  const rowItems = []

  cfg.db.transaction(maj1SecretPTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.maj1SecretP = maj1SecretP

function maj1SecretPTr (cfg, args, rowItems) {

  const secret = stmt(cfg, selsecretidns).get({ id: args.id, ns: args.ns }) 
  if (!secret) {
    console.log('Secret inconnu.')
    throw new AppExc(X_SRV, 'Secret inexistant.')
  }

  const deltav1 = args.v1 - secret.v1
  secret.v1 = args.v1
  secret.mcs = args.mcs
  secret.txts = args.txts
  secret.v = args.v

  const a = stmt(cfg, selavgrvqid).get({ id: args.id })
  if (a) {
    if (secret.st === 99999) {
      a.v1 = a.v1 + deltav1
    } else {
      a.vm1 = a.vm1 + deltav1
    }
  }
  if (!a || a.v1 > a.q1 || a.vm1 > a.qm1) {
    console.log('Quotas d\'espace insuffisants.')
    // throw new AppExc(X_SRV, 'Quotas d\'espace insuffisants.')
  }

  rowItems.push(newItem('secret', secret))

  stmt(cfg, updavgrvq).run(a)
  stmt(cfg, upd1secret).run(secret)
}
