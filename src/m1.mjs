import { crypt } from './crypto.mjs'
import { getdhc, sleep, dds, deserial, serial } from './util.mjs'
import { getSession, syncListQueue, processQueue } from './session.mjs'
import { AppExc, X_SRV, E_WS, INDEXT } from './api.mjs'
import { schemas } from './schemas.mjs'
import { putFile, delFile } from './storage.mjs'

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

function checkSession (sessionId) {
  const session = getSession(sessionId)
  if (!session) throw new AppExc(E_WS, 'Session interrompue. Se déconnecter et tenter de se reconnecter')
  return session
}

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
const inscompte = 'INSERT INTO compte (id, v, dds, dpbh, pcbh, kx, mack, vsh) VALUES (@id, @v, @dds, @dpbh, @pcbh, @kx, @mack, @vsh)'
const insprefs = 'INSERT INTO prefs (id, v, mapk, vsh) VALUES (@id, @v, @mapk, @vsh)'
const insavatar = 'INSERT INTO avatar (id, v, st, vcv, dds, cva, vsh) VALUES (@id, @v, @st, @vcv, @dds, @cva, @vsh)'
const insavrsa = 'INSERT INTO avrsa (id, clepub, vsh) VALUES (@id, @clepub, @vsh)'
const selavgrvqid = 'SELECT * FROM avgrvq WHERE id = @id'
const insavgrvq = 'INSERT INTO avgrvq (id, q1, q2, qm1, qm2, v1, v2, vm1, vm2, vsh) VALUES (@id, @q1, @q2, @qm1, @qm2, @v1, @v2, @vm1, @vm2, @vsh)'
const updavgrvq = 'UPDATE avgrvq SET q1 = @q1, q2 = @q2, qm1 = @qm1, qm2 = @qm2, v1 = @v1, v2 = @v2, vm1 = @vm1, vm2 = @vm2 WHERE id = @id'
const selcomptedpbh = 'SELECT * FROM compte WHERE dpbh = @dpbh'
const selprefsid = 'SELECT * FROM prefs WHERE id = @id'
const selavatarid = 'SELECT * FROM avatar WHERE id = @id'
const selsecretidns = 'SELECT * FROM secret WHERE id = @id AND ns = @ns'

function idx (id) {
  return (id % (nbVersions - 1)) + 1
}

/* Creation de compte sans parrain ****************************************
- sessionId, mdp64, q1, q2, qm1, qm2, clePub rowCompte, rowAvatar, rowPrefs
Retour :
- sessionId
- dh
*/
function creationCompte (cfg, args) {
  checkSession(args.sessionId)  
  const result = { sessionId: args.sessionId, dh: getdhc() }
  if (cfg.cle !== args.mdp64) {
    throw new AppExc(X_SRV, 'Mot de passe de l\'organisation non reconnu. Pour créer un compte privilégié, le mot de passe de l\'organisation est requis')
  }
  const session = checkSession(args.sessionId)
  const compte = schemas.deserialize('rowcompte', args.rowCompte)
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)
  const prefs = schemas.deserialize('rowprefs', args.rowPrefs)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(compte.id)
  versions[j]++
  compte.v = versions[j]
  prefs.v = versions[j]

  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j]
  setValue(cfg, VERSIONS)

  compte.dds = dds.ddsc(0)
  avatar.dds = dds.ddsag(0)
  const avrsa = { id: avatar.id, clepub: args.clePub, vsh: 0 }
  const avgrvq = { id: avatar.id, q1: args.q1*MO, q2: args.q2*MO, qm1: args.qm1*MO, qm2:args.qm2*MO, v1: 0, v2:0, vm1:0, vm2: 0, vsh: 0 }

  cfg.db.transaction(creationCompteTr)(cfg, session, compte, avatar, prefs, avrsa, avgrvq)

  result.rowItems = [ newItem('compte', compte), newItem('avatar', avatar), newItem('prefs', prefs) ]    
  return result
}
m1fonctions.creationCompte = creationCompte

function creationCompteTr (cfg, session, compte, avatar, prefs, avrsa, avgrvq) {
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
  stmt(cfg, insprefs).run(prefs)
  stmt(cfg, insavrsa).run(avrsa)
  stmt(cfg, insavgrvq).run(avgrvq)
  session.compteId = compte.id
  session.plusAvatars([avatar.id])
}

/***************************************
Enregistrement d'une préférence d'un compte :
Args : 
- sessionId
- id: du compte
- code : code de la préférence
- datak : données de la préférence crypté par la clé K
Retour :
- sessionId
- dh
Exception : compte inexistant
*/
const updprefs = 'UPDATE prefs SET v = @v, mapk = @mapk WHERE id = @id'

function prefCompte (cfg, args) {
  checkSession(args.sessionId) 
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  const v = versions[j]

  const rowItems = []

  cfg.db.transaction(prefCompteTr)(cfg, args.id, v, args.code, args.datak, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.prefCompte = prefCompte

function prefCompteTr (cfg, id, v, code, datak, rowItems) {
  const p = stmt(cfg, selprefsid).get({ id: id })
  if (!p) {
    throw new AppExc(X_SRV, 'Compte inexistant. Bug probable.')
  }
  const x = deserial(p.mapk)
  x[code] = datak
  p.mapk = serial(x)
  p.v = v
  stmt(cfg, updprefs).run( { mapk: p.mapk, v, id })
  rowItems.push(newItem('prefs', p))
}

/***************************************
Enregistrement de la CV d'un avatar :
Args : 
- sessionId
- id: de l'avatar
- phinfo : [ph, info] crypté par la clé de l'avatar et sérialisé]
Retour :
- sessionId
- dh
Exception : avatar inexistant
*/
const updcvavatar = 'UPDATE avatar SET v = @v, vcv = @vcv, cva = @cva WHERE id = @id'

function cvAvatar (cfg, args) {
  checkSession(args.sessionId)
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
Retour = compte, prefs
*/
async function connexionCompte (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: args.dpbh })
  if (!c || (c.pcbh !== args.pcbh)) {
    throw new AppExc(X_SRV, 'Compte non authentifié : aucun compte n\'est déclaré avec cette phrase secrète')
  }
  const p = stmt(cfg, selprefsid).get({ id: c.id })
  if (!p) {
    throw new AppExc(X_SRV, 'Compte corrompu : données de préférence absentes')
  }
  result.rowItems = [ newItem('compte', c), newItem('prefs', p) ]
  return result
}
m1fonctions.connexionCompte = connexionCompte

/**************************************** */
const selavatar = 'SELECT * FROM avatar WHERE id = @id AND v > @v'
const selsecret = 'SELECT * FROM secret WHERE id = @id AND v > @v'
const selinvitgr = 'SELECT * FROM invitgr WHERE id = @id AND v > @v'
const selcontact = 'SELECT * FROM contact WHERE id = @id AND v > @v'
const selinvitct = 'SELECT * FROM invitct WHERE id = @id AND v > @v'
const selrencontre = 'SELECT * FROM rencontre WHERE id = @id AND v > @v'
const selparrain = 'SELECT * FROM parrain WHERE id = @id AND v > @v'
const selgroupe = 'SELECT * FROM groupe WHERE id = @id AND v > @v'
const selmembre = 'SELECT * FROM membre WHERE id = @id AND v > @v'

/*****************************************
Chargement des avatars d'un compte
- sessionId
- idsVers : map de clé:id de l'avatar, valeur: version détenue en session
*/
async function chargerAv (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  for(const id in args.idsVers) {
    const rows = stmt(cfg, selavatar).all({ id, v: args.idsVers[id] })
    rows.forEach((row) => {
      rowItems.push(newItem('avatar', row))
    })
  }
  result.rowItems = rowItems
  return result
}
m1fonctions.chargerAv = chargerAv

/*****************************************
Chargement des rows d'un avatar 
    { name: 'sessionId', type: 'string' },
    { name: 'avgr', type: 'long' },
    { name: 'lv', type: arrayIntType } 7 compteurs pour les versions des 7 tables
*/

async function syncAv (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  const id = args.avgr
  let rows
  const lva = args.lv[INDEXT.AVATAR]
  if (lva !== -1) {
    rows = stmt(cfg, selavatar).all({ id, v: lva })
    rows.forEach((row) => {
      rowItems.push(newItem('avatar', row))
    })
  }
  rows = stmt(cfg, selcontact).all({ id, v: args.lv[INDEXT.CONTACT] })
  rows.forEach((row) => {
    rowItems.push(newItem('contact', row))
  })
  rows = stmt(cfg, selinvitct).all({ id, v: args.lv[INDEXT.INVITCT] })
  rows.forEach((row) => {
    rowItems.push(newItem('invitvt', row))
  })
  rows = stmt(cfg, selinvitgr).all({ id, v: args.lv[INDEXT.INVITGR] })
  rows.forEach((row) => {
    rowItems.push(newItem('invitgr', row))
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
  checkSession(args.sessionId)
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
*/

/******************************************
Abonnement de la session aux compte et listes d'avatars et de groupes et signatures
- sessionId
- idc : id du compte
- lav : array des ids des avatars
- lgr : array des ids des groupes
- sign : true s'il faut signer
*/
async function syncAbo (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const session = checkSession(args.sessionId)

  // Abonnements
  session.compteId = args.idc
  session.avatarsIds = new Set(args.lav)
  session.groupesIds = new Set(args.lgr)

  // Signatures
  if (args.sign) {
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
const selcv1 = 'SELECT id, vcv, st, cva FROM avatar WHERE vcv > @vcv AND id IN ('
const selcv2 = 'SELECT id, vcv, st, cva FROM avatar WHERE id IN ('

async function chargtCVs (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const session = checkSession(args.sessionId)
  session.cvsIds = new Set(args.lcvmaj.concat(args.lcvchargt))
  const rowItems = []

  if (args.lcvmaj.length) {
    const lst = []
    args.lcvmaj.forEach((sid) => { lst.push(crypt.sidToId(sid)) })
    // lst.push(3382219599812300) pour tester la syntaxe IN
    const st = cfg.db.prepare(selcv1 + lst.join(',') + ')')
    const rows = st.all({ vcv: args.vcv })
    for (const row of rows) {
      rowItems.push(newItem('cv', row))
    }
  }
  
  if (args.lcvchargt.length) {
    const lst = []
    args.lcvchargt.forEach((sid) => { lst.push(crypt.sidToId(sid)) })
    const st = cfg.db.prepare(selcv2 + lst.join(',') + ')')
    const rows = st.all()
    for (const row of rows) {
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
  checkSession(args.sessionId)
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
  // checkSession(args.sessionId)
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
- ts, id, ns, ic, st, ora, v1, mcg, mc, im, txts, dups, refs, id2, ns2, ic2, dups2
Retour :
- sessionId
- dh
Exception : dépassement des quotas 
*/
const inssecret = 'INSERT INTO secret (id, ns, ic, v, st, ora, v1, v2, mc, txts, mpjs, dups, refs, vsh) ' +
  'VALUES (@id, @ns, @ic, @v, @st, @ora, @v1, @v2, @mc, @txts, @mpjs, @dups, @refs, @vsh)'

async function nouveauSecret (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  const v = versions[j]
  let vb
  if (args.ts === 1) {
    const j2 = idx(args.id2)
    versions[j2]++
    setValue(cfg, VERSIONS)
    vb = versions[j2]
  }

  let mc
  if (args.ts === 2) {
    const x = { }
    x[0] = args.mcg
    x[args.im] = args.mc
    mc = serial(x)
  } else {
    mc = args.mc
  }

  const secret = { 
    id: args.id,
    ns: args.ns,
    ic: args.ic,
    v: v,
    st: args.st,
    ora: args.ora,
    v1: args.v1,
    v2: 0,
    mc: mc,
    txts: args.txts,
    mpjs: null,
    dups: args.ts === 1 ? args.dups : null,
    refs: args.refs || null,
    vsh: 0
  }
  
  let secret2
  if (args.ts ===1) secret2 = { 
    id: args.id2,
    ns: args.ns2,
    ic: args.ic2,
    v: vb,
    st: args.st,
    ora: args.ora,
    v1: args.v1,
    v2: 0,
    mc: null,
    txts: args.txts,
    mpjs: null,
    dups: args.dups2,
    refs: args.refs,
    vsh: 0
  }

  cfg.db.transaction(nouveauSecretTr)(cfg, secret, secret2 )

  const rowItems = []
  rowItems.push(newItem('secret', secret))
  if (args.ts ===1) rowItems.push(newItem('secret', secret2))
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.nouveauSecret = nouveauSecret

function nouveauSecretTr (cfg, secret, secret2) {
  const a = stmt(cfg, selavgrvqid).get({ id: secret.id })
  if (a) {
    if (secret.st === 99999) {
      a.v1 = a.v1 + secret.v1
    } else {
      a.vm1 = a.vm1 + secret.v1
    }
  }
  if (!a || a.v1 > a.q1 || a.vm1 > a.qm1) {
    // console.log('Quotas d\'espace insuffisants.')
    throw new AppExc(X_SRV, 'Quotas d\'espace insuffisants.')
  }
  stmt(cfg, updavgrvq).run(a)
  stmt(cfg, inssecret).run(secret)

  if (secret2) {
    const a = stmt(cfg, selavgrvqid).get({ id: secret2.id })
    if (a) {
      if (secret.st === 99999) {
        a.v1 = a.v1 + secret.v1
      } else {
        a.vm1 = a.vm1 + secret.v1
      }
    }
    stmt(cfg, updavgrvq).run(a)
    stmt(cfg, inssecret).run(secret2)
  }
}

/***************************************
MAJ secret
Args : 
- sessionId
- ts, id, ns, v1, mc, im, mcg, txts, ora, temp, id2, ns2
temp : null: inchangé, 99999: devient permanent, 780: (re)devient temporaire
ora : null: inchangé, xxxp (im d'exclusivité, 0/1 libre / protégé)
txts: null: inchangé
mcg: null: inchangé (im sert à mettre à jour les motsclés)

Retour :
- sessionId
- dh
Exception : dépassement des quotas 
*/
const upd1secret = 'UPDATE secret SET v = @v, st = @st, ora = @ora, v1 = @v1, txts = @txts, mc = @mc WHERE id = @id AND ns = @ns'

async function maj1Secret (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  args.v = versions[j]

  if (args.ts ===1) {
    const j2 = idx(args.id2)
    versions[j2]++
    setValue(cfg, VERSIONS)
    args.vb = versions[j2]
  }

  const rowItems = []

  cfg.db.transaction(maj1SecretTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.maj1Secret = maj1Secret

function maj1SecretTr (cfg, args, rowItems) {

  const secret = stmt(cfg, selsecretidns).get({ id: args.id, ns: args.ns }) 
  if (!secret) {
    // console.log('Secret inconnu.')
    throw new AppExc(X_SRV, 'Secret inexistant.')
  }

  let deltav1 = 0, deltavm1 = 0, deltav2 = 0, deltavm2 = 0
  const pv1 = args.v1 === null ? secret.v1 : args.v1
  if (args.temp === null) {
    // pas de changement perm / temp
    if (secret.st === 99999) {
      deltav1 = pv1 - secret.v1 // il était permanent
    } else {
      deltavm1 = pv1 - secret.v1
    }
  } else if (args.temp === 99999) { // devient permanent
    deltav1 = pv1 // le volume permanent augmente du nouveau volume
    deltavm1 = -secret.v1 // le volume temporaire diminue de l'ancien volume
    deltav2 = secret.v2
    deltavm2 = -secret.v2
    secret.st = 99999
  } else { // (args.temp > 0 && args.temp < 99999) - (re)devient temporaire
    deltav1 = -secret.v1 // le volume permanent diminue de l'ancien volume
    deltavm1 = pv1 // le volume temporaire augmente du nouveau volume
    deltav2 = -secret.v2
    deltavm2 = secret.v2
    secret.st = args.temp
  }
  
  secret.v = args.v
  secret.v1 = pv1
  if (args.txts !== null) secret.txts = args.txts // sinon texte inchangé par convention
  if (args.ts !== 2 && args.mc !== null) secret.mc = args.mc
  if (args.ts === 2 && (args.mc !== null || args.mcg !== null)) {
    const mc = secret.mc ? deserial(secret.mc) : { }
    if (args.mc !== null) {
      if (args.mc.length) {
        mc[args.im] = args.mc
      } else {
        delete mc[args.im]
      }
    }
    if (args.mcg !== null) {
      if (args.mc.length) {
        mc[0] = args.mcg
      } else {
        delete mc[0]
      }
    }
    secret.mc = serial(mc)
  }
  if (args.ora !== null) secret.ora = args.ora

  let secret2
  if (args.ts === 1) {
    // secret2 PEUT avoir été détruit
    secret2 = stmt(cfg, selsecretidns).get({ id: args.id2, ns: args.ns2 }) 
    if (secret2) {
      secret2.v = args.vb
      secret2.st = secret.st
      secret2.v1 = secret.v1
      secret2.txts = secret.txts
      secret2.ora = secret.ora
    }
  }

  if (deltav1 || deltav2 || deltavm1 || deltavm2) {
    const a = stmt(cfg, selavgrvqid).get({ id: args.id })
    if (a) {
      a.v1 = a.v1 + deltav1
      a.vm1 = a.vm1 + deltavm1
      a.v2 = a.v2 + deltav2
      a.vm2 = a.vm2 + deltavm2
    }
    if (!a || a.v1 > a.q1 || a.vm1 > a.qm1 || a.v2 > a.q2 || a.vm2 > a.qm2) {
      console.log('Quotas d\'espace insuffisants.')
      throw new AppExc(X_SRV, 'Quotas d\'espace insuffisants.')
    }
    stmt(cfg, updavgrvq).run(a)

    if (secret2) {
      const a = stmt(cfg, selavgrvqid).get({ id: args.id2 })
      if (a) {
        a.v1 = a.v1 + deltav1
        a.vm1 = a.vm1 + deltavm1
        a.v2 = a.v2 + deltav2
        a.vm2 = a.vm2 + deltavm2
        stmt(cfg, updavgrvq).run(a)
      }
    }
  }

  rowItems.push(newItem('secret', secret))
  stmt(cfg, upd1secret).run(secret)

  if (secret2) {
    stmt(cfg, upd1secret).run(secret2)
    rowItems.push(newItem('secret', secret2))
  }
}

/***************************************
Pièce jointe d'un secret - Ajout / modification / suppression
Args : 
- sessionId
- { id: s.id, ns: s.ns, cle, idc, buf, lg, id2, ns2 }
- `cle` : hash court en base64 URL de nom.ext
- `idc` : id complète de la pièce jointe (nom.txt/type/dh), cryptée par la clé du secret et en base64 URL.
- buf : contenu binaire crypté.
- lg : taille de la pièce jointe d'origine (non gzippée, non cryptée)

Suppression : buf et idc sont null

Retour :
- sessionId
- dh
Exception : dépassement des quotas 
*/
const upd2secret = 'UPDATE secret SET v = @v, v2 = @v2, mpjs = @mpjs WHERE id = @id AND ns = @ns'

async function pjSecret (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  args.v = versions[j]

  if (args.ts ===1) {
    const j2 = idx(args.id2)
    versions[j2]++
    setValue(cfg, VERSIONS)
    args.vb = versions[j2]
  }

  const secret = stmt(cfg, selsecretidns).get({ id: args.id, ns: args.ns })
  if (!secret) {
    // console.log('Secret inconnu.')
    throw new AppExc(X_SRV, 'Secret inexistant.')
  }

  // calcul de v2 et de mpjs
  const mpjs = !secret.mpjs ? {} : deserial(secret.mpjs)
  if (args.idc === null) {
    if (args.idc === null) {
      delete mpjs[args.cle]
    } else {
      mpjs[args.cle] = [args.idc, args.lg]
    }
  } else {
    mpjs[args.cle] = [args.idc, args.lg]
  }
  let v = 0, deltav2 = 0, deltavm2 = 0
  for (const c in mpjs) v += mpjs[c][1]
  if (secret.st === 99999) { // permanent
    deltav2 = v - secret.v2
    deltavm2 = 0
  } else {
    deltav2 = 0
    deltavm2 = v - secret.v2
  }
  if (deltav2 || deltavm2 && args.buf) {
    const a = stmt(cfg, selavgrvqid).get({ id: args.id })
    if (a) {
      a.v2 = a.v2 + deltav2
      a.vm2 = a.vm2 + deltavm2
    }
    if (!a || a.v1 > a.q1 || a.vm1 > a.qm1 || a.v2 > a.q2 || a.vm2 > a.qm2) {
      console.log('Quotas d\'espace insuffisants.')
      throw new AppExc(X_SRV, 'Quotas d\'espace insuffisants.')
    }
  }

  const secid = crypt.idToSid(args.id) + '@' + crypt.idToSid(args.ns)
  const pjid = args.idc ? args.cle + '@' + args.idc : null

  if (args.idc) {
    // stockage nouvelle version
    await putFile (cfg, cfg.code, secid, pjid, args.buf)
  }

  const rowItems = []

  try {
    cfg.db.transaction(pjSecretTr)(cfg, args, rowItems)
    // suppressions des anciennes versions (même clé) mais pas de la nouvelle 
    // SAUF si pjid est null auquel cas c'est une suppression
    delFile (cfg, cfg.code, secid, args.cle, pjid)
    syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
    setImmediate(() => { processQueue() })
    return { sessionId: args.sessionId, dh: dh }
  } catch (ex) {
    // "rollback" sur stockage nouvelle version SAUF si pjid null (on ne supprime surtout pas)
    if (pjid !== null) delFile (cfg, cfg.code, secid, null, pjid) 
    throw ex
  }
}
m1fonctions.pjSecret = pjSecret

function pjSecretTr (cfg, args, rowItems) {

  const secret = stmt(cfg, selsecretidns).get({ id: args.id, ns: args.ns }) 
  if (!secret) {
    // console.log('Secret inconnu.')
    throw new AppExc(X_SRV, 'Secret inexistant.')
  }

  secret.v = args.v
  // calcul de v2 et de mpjs
  const mpjs = !secret.mpjs ? {} : deserial(secret.mpjs)
  if (args.idc === null) {
    delete mpjs[args.cle]
  } else {
    mpjs[args.cle] = [args.idc, args.lg]
  }
  let v = 0, deltav2 = 0, deltavm2 = 0
  for (const c in mpjs) v += mpjs[c][1]
  secret.mpjs = serial(mpjs)
  secret.v2 = v
  rowItems.push(newItem('secret', secret))
  stmt(cfg, upd2secret).run(secret)

  let secret2
  if (args.ts === 1) {
    // secret2 PEUT avoir été détruit
    secret2 = stmt(cfg, selsecretidns).get({ id: args.id2, ns: args.ns2 }) 
    if (secret2) {
      secret2.v = args.vb
      secret2.v2 = secret.v2
      secret2.mpjs = secret.mpjs
      stmt(cfg, upd2secret).run(secret2)
      rowItems.push(newItem('secret', secret2))
    }
  }

  if (secret.st === 99999) { // permanent
    deltav2 = v - secret.v2
    deltavm2 = 0
  } else {
    deltav2 = 0
    deltavm2 = v - secret.v2
  }
  if (deltav2 || deltavm2) {
    const a = stmt(cfg, selavgrvqid).get({ id: args.id })
    if (a) {
      a.v2 = a.v2 + deltav2
      a.vm2 = a.vm2 + deltavm2
      stmt(cfg, updavgrvq).run(a)
    }

    if (secret2) {
      const a = stmt(cfg, selavgrvqid).get({ id: args.id2 })
      if (a) {
        a.v2 = a.v2 + deltav2
        a.vm2 = a.vm2 + deltavm2
        stmt(cfg, updavgrvq).run(a)
      }
    }
  }
}

/******************************************************************
 * Parrainage
 * - sessionId
 * - pph : hash de la phrase de parrainge
 * - dlv : date limite de validité
 * - id : de l'avatar parrain
 * - aps : booléen - true si le parrain accepte le partage de secret (false si limitation à l'ardoise)
 * - q1 q2 qm1 qm2 : quotas donnés par le parrain
 * - datak : [phrase de parainage (string), clé X (u8)] sérialisé et crypté par la clé K du parrain
 * - datax : sérialisation et cryptage par la clé X de :
 *  - nomp, rndp : du parrain
 *  - nomf, rndf : du filleul
 *  - cc : u8, clé du couple
 *  - ic : numéro de contact du filleul chez le parrain
 * - ardc : mot d'accueil du parrain crypté par la clé du couple
 * Pour créer le row contact :
 * - ic : indice de contact du filleul chez le parrain
 * - data2k : sérialisation et cryptage par la clé K du parrain de :
 *  - nom, rnd du filleul
 *  - cc : u8, clé du couple
 * Pour le transfert de quotas
 * - idf : id du filleul
 * Retour :
 * - dh : 
 */
const insparrain = 'INSERT INTO parrain (pph, id, v, dlv, st, q1, q2, qm1, qm2, datak, datax, ardc, vsh) '
  + 'VALUES (@pph, @id, @v, @dlv, @st, @q1, @q2, @qm1, @qm2, @datak, @datax, @ardc, @vsh)'
const inscontact = 'INSERT INTO contact (id, ic, v, st, dlv, q1, q2, qm1, qm2, ardc, icbc, datak, mc, infok, vsh) '
  + 'VALUES (@id, @ic, @v, @st, @dlv, @q1, @q2, @qm1, @qm2, @ardc, @icbc, @datak, @mc, @infok, @vsh)'
const selpphparrain = 'SELECT * FROM parrain WHERE pph = @pph'

async function nouveauParrainage (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  const v = versions[j] // version des row parrain et contact

  // parrain : ['pph', 'id', 'v', 'dlv', 'st', 'q1', 'q2', 'qm1', 'qm2', 'datak', 'datax', 'ardc', 'vsh']
  const parrain = { pph: args.pph, id: args.id, v, dlv: args.dlv, st: 0, ...args.quotas, datak: args.datak, datax: args.datax, ardc: args.ardc, vsh: 0 }
  rowItems.push(newItem('parrain', parrain))

  // contact : ['id', 'ic', 'v', 'st', 'dlv', 'q1', 'q2', 'qm1', 'qm2', 'ardc', 'icbc', 'datak', 'mc', 'infok', 'vsh']
  const contact = { id: args.id, ic: args.ic, v, st: args.aps ? 31 : 30, dlv: args.dlv, ...args.quotas, ardc: args.ardc, icbc: null, datak: args.data2k, mc: null, infok: null, vsh: 0 }
  rowItems.push(newItem('contact', contact))

  // avgrq: ['id', 'q1', 'q2', 'qm1', 'qm2', 'v1', 'v2', 'vm1', 'vm2', 'vsh']
  const avgrqf = { id: args.idf, ...args.quotas, v1: 0, v2: 0, vm1: 0, vm2: 0, vsh: 0 }

  cfg.db.transaction(nouveauParrainageTr)(cfg, parrain, contact, avgrqf, args.id, args.quotas)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.nouveauParrainage = nouveauParrainage

function nouveauParrainageTr (cfg, parrain, contact, avgrqf, id, q) {
  const p = stmt(cfg, selpphparrain).get({ pph: parrain.pph })
  if (p) {
    console.log('Parrain : phrase déjà utilisée')
    const x = p.id === parrain.id ? ' par votre compte.' : ' par un autre compte.'
    throw new AppExc(X_SRV, 'Cette phrase de parrainage est trop proche d\'une déjà enregistrée' + x)
  }

  stmt(cfg, insparrain).run(parrain)
  stmt(cfg, inscontact).run(contact)

  // Retrait de quotas
  const a = stmt(cfg, selavgrvqid).get({ id: id })
  if (a) {
    a.q1 = a.q1 - q.q1 * MO
    a.q2 = a.q2 - q.q2 * MO
    a.qm1 = a.qm1 - q.qm1 * MO
    a.qm2 = a.qm2 - q.qm2 * MO
  }
  if (!a || a.v1 > a.q1 || a.vm1 > a.qm1 || a.v2 > a.q2 || a.vm2 > a.qm2) {
    console.log('Quotas d\'espace insuffisants.')
    throw new AppExc(X_SRV, 'Quotas d\'espace insuffisants.')
  }
  stmt(cfg, updavgrvq).run(a)
  stmt(cfg, insavgrvq).run(avgrqf)
}

/******************************************************************
 * Acceptation / refus d'un parrainage
 * - sessionId
 * - ok : true si acceptation
 * - pph : hash de la phrase de parrainage
 * - idp : de l'avatar parrain
 * - icp : ic du contact du filleul chez le parrain
 * - ardc : mot du filleul crypté par la clé du couple
 * Si acceptation
 * - idf : id du filleul
 * - icbc : indice de P comme contact chez F crypté par leur clé cc
 * - clePub, rowCompte, rowAvatar, rowPrefs : v attribuées par le serveur
 * - rowContact (du filleul) : st, dlv et quotas attribués par le serveur
 *  Pour maj de sr des rows contact du parrain / filleul :
 * - aps : booléen - true si le filleul accepte le partage de secret (false si limitation à l'ardoise)* 
 * Retour : sessionId, dh
 */

const upd1contact = 'UPDATE contact SET v = @v, st = @st, dlv = @dlv, icbc = @icbc, q1 = @q1, q2 = @q2, qm1 = @qm1, qm2 = @qm2, ardc = @ardc WHERE id = @id AND ic = @ic'
const upd1parrain = 'UPDATE parrain SET v = @v, st = @st, dlv = @dlv, ardc = @ardc WHERE pph = @pph'
const supprcontact = 'UPDATE contact SET v = @v, st = @st, dlv = 0, icbc = null, q1 = 0, q2 = 0, qm1 = 0, qm2 = 0, ardc = null, datak = null, mc = null, infok = null, vsh = 0 WHERE id = @id AND ic = @ic'

async function acceptParrainage (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idp)
  versions[j]++
  args.vp = versions[j] // version des rows parrain
  if (args.ok) {
    j = idx(args.idf)
    versions[j]++
    args.vf = versions[j] // version des rows filleul  
  }
  setValue(cfg, VERSIONS)

  const compte = args.ok ? schemas.deserialize('rowcompte', args.rowCompte) : null
  const avatar = args.ok ? schemas.deserialize('rowavatar', args.rowAvatar) : null
  const prefs = args.ok ? schemas.deserialize('rowprefs', args.rowPrefs) : null
  const contactf = args.ok ? schemas.deserialize('rowcontact', args.rowContact) : null
  const items = {}

  cfg.db.transaction(acceptParrainageTr)(cfg, session, args, result, compte, avatar, prefs, contactf, items)

  let rowItems
  const i1 = newItem('contact', items.contactp)
  const i2 = newItem('parrain', items.parrain)
  if (args.ok) {
    const i3 = newItem('compte', compte)
    const i4 = newItem('avatar', avatar)
    const i5 = newItem('prefs', prefs)
    const i6 = newItem('contact', contactf)
    rowItems = [i1, i2, i3, i4, i5, i6]
    result.rowItems = [i3, i4, i5, i6]
  } else {
    rowItems = [i1, i2]
  }
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.acceptParrainage = acceptParrainage
  
function acceptParrainageTr (cfg, session, args, result, compte, avatar, prefs, contactf, items) {
  const p = stmt(cfg, selpphparrain).get({ pph: args.pph })
  if (!p) {
    throw new AppExc(X_SRV, 'Phrase de parrainage inconnue')
  }
  if (p.st !== 0) {
    throw new AppExc(X_SRV, 'Ce parrainage a déjà fait l\'objet ' + (p.st === 1 ? 'd\'une acceptation.' : 'd\'un refus'))
  }

  const contactp = stmt(cfg, selcontact).get({ id: args.idp, ic: args.icp })
  if (!contactp) {
    throw new AppExc(X_SRV, 'Contact parrain non trouvé (données corrompues)')
  }

  if (args.ok) {
    const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
    if (c) {
      if (c.pcbh === compte.pcbh) {
        throw new AppExc(X_SRV, 'Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
      } else {
        throw new AppExc(X_SRV, 'Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
      }
    }
  
    // MAJ du row parrain : v, st, ardc
    p.v = args.vp
    p.ardc = args.ardc
    p.st = 2
    stmt(cfg, upd1parrain).run(p)

    // MAJ des contacts p et f : v, st, dlv, quotas, ardc
    /* - `st` : statut entier de 2 chiffres, `x y` : **les valeurs < 0 indiquent un row supprimé (les champs après sont null)**.
    - `x` :
      - 0 : contact présumé actif,
      - 1 : contact plus présumé actif,
      - 2 : invitation à être contact plus en cours (sous contrôle de dlv),
      - 3 : parrainage en cours (sous contrôle de dlv)
      - 4 : parrainage refusé (sous contrôle de dlv)
      - 9 : présumé disparu
    - `y` : 0 1 2 3 selon que A et B acceptent le partage de secrets
    */
    contactp.v = args.vp
    contactf.v = args.vf

    const pas = (contactp.st % 10) !== 0
    const fas = args.aps
    contactp.st = 10 + (pas ? 1: 0) + (fas ? 2 : 0)
    contactf.st = 10 + (pas ? 2: 0) + (fas ? 1 : 0)
    contactp.dlv = 0
    contactf.dlv = 0

    contactp.q1 = contactp.q1 - p.q1*MO
    contactf.q1 = p.q1*MO
    contactp.q2 = contactp.q2 - p.q2*MO
    contactf.q2 = p.q2*MO
    contactp.qm1 = contactp.qm1 - p.qm1*MO
    contactf.qm1 = p.qm1*MO
    contactp.qm2 = contactp.qm2 - p.qm2*MO
    contactf.qm2 = p.qm2*MO
    contactp.ardc = args.ardc
    contactp.icbc = args.icbc
    stmt(cfg, upd1contact).run(contactp)
    stmt(cfg, inscontact).run(contactf)

    // Insertion des nouveaux compte, avatar, prefs du filleul
    compte.v = args.vf
    avatar.v = args.vf
    prefs.v = args.vf
    compte.dds = dds.ddsc(0)
    avatar.dds = dds.ddsag(0)
    stmt(cfg, inscompte).run(compte)
    stmt(cfg, insavatar).run(avatar)
    stmt(cfg, insprefs).run(prefs)

    // Clé RSA du filleul
    const avrsa = { id: avatar.id, clepub: args.clePub, vsh: 0 }
    stmt(cfg, insavrsa).run(avrsa)

    // Quotas du filleul
    const avgrvq = { id: avatar.id, q1: p.q1*MO, q2: p.q2*MO, qm1: p.qm1*MO, qm2:p.qm2*MO, v1: 0, v2:0, vm1:0, vm2: 0, vsh: 0 }
    stmt(cfg, insavgrvq).run(avgrvq)

    // Contexte de session du filleul
    session.compteId = compte.id
    session.plusAvatars([avatar.id])
  } else { // Refus
    // MAJ du row parrain : v, st, ardc
    p.v = args.vp
    p.ardc = args.ardc
    p.st = 1 // refus
    stmt(cfg, upd1parrain).run(p)
    
    // Suppression du contact P
    contactp.v = args.vp
    stmt(cfg, supprcontact).run(contactp)
  }
  items.parrain = p
  items.contactp = contactp
}

async function getPph (cfg, args) {
  try {
    const p = stmt(cfg, selpphparrain).get({ pph: args.pph })
    if (!p) return { bytes0 }
    const b = serial(p)
    return { bytes: b }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
m1fonctions.getPph = getPph
