import { crypt } from './crypto.mjs'
import { getdhc, sleep, deserial, serial } from './util.mjs'
import { getSession, syncListQueue, processQueue } from './session.mjs'
import { AppExc, X_SRV, E_WS, INDEXT, DateJour, Compteurs } from './api.mjs'
import { schemas } from './schemas.mjs'
import { putFile, delFile } from './storage.mjs'

export const m1fonctions = { }
const VERSIONS = 1
const NBEARD = 10
const ANCARD = 86400000 * 56

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

/******************************************
Si la dds actuelle de l'avatar ou du groupe n'a pas plus de 14 jours, elle convient encore.
Sinon il faut en réattribuer une qui ait entre 0 et 14 d'âge.
*/
function ddsAvatarGroupe (dds) {
  const j = new DateJour().nbj
  return ((j - dds) > 14) ? j - Math.floor(Math.random() * 14) : dds
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
const inscompte = 'INSERT INTO compte (id, v, dpbh, pcbh, kx, cprivk, mack, vsh) VALUES (@id, @v, @dpbh, @pcbh, @kx, @cprivk, @mack, @vsh)'
const inscompta = 'INSERT INTO compta (id, idp, v, dds, st, data, vsh) VALUES (@id, @idp, @v, @dds, @st, @data, @vsh)'
const insprefs = 'INSERT INTO prefs (id, v, mapk, vsh) VALUES (@id, @v, @mapk, @vsh)'
const insavatar = 'INSERT INTO avatar (id, v, st, vcv, dds, cva, lgrk, vsh) VALUES (@id, @v, @st, @vcv, @dds, @cva, @lgrk, @vsh)'
const insavrsa = 'INSERT INTO avrsa (id, clepub, vsh) VALUES (@id, @clepub, @vsh)'
const insardoise = 'INSERT INTO ardoise (id, v, dhl, mcc, mcp, data, vsh) VALUES (@id, @v, @data, @vsh)'
const selcomptedpbh = 'SELECT * FROM compte WHERE dpbh = @dpbh'
const selprefsid = 'SELECT * FROM prefs WHERE id = @id'
const selcomptaid = 'SELECT * FROM compta WHERE id = @id'
const selardoiseid = 'SELECT * FROM ardoise WHERE id = @id'
const selavatarid = 'SELECT * FROM avatar WHERE id = @id'
const selsecretidns = 'SELECT * FROM secret WHERE id = @id AND ns = @ns'

function idx (id) {
  return (id % (nbVersions - 1)) + 1
}

/* Creation du compte d'un comptable ****************************************
- sessionId, clePubAv, clePubC, rowCompte, rowCompta, rowAvatar, rowPrefs
Retour :
- sessionId
- dh
*/
function creationCompte (cfg, args) {
  const session = checkSession(args.sessionId)
  const compte = schemas.deserialize('rowcompte', args.rowCompte)

  if (cfg.comptables.indexOf(compte.pcbh) === -1) {
    throw new AppExc(X_SRV, 'Cette phrase secrète n\'est reconnue comme étant l\'une des comptables de l\'organisation')
  }

  const result = { sessionId: args.sessionId, dh: getdhc() }
  const compta = schemas.deserialize('rowcompta', args.rowCompta)
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)
  const prefs = schemas.deserialize('rowprefs', args.rowPrefs)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(compte.id)
  versions[j]++
  compte.v = versions[j]
  compta.v = versions[j]
  prefs.v = versions[j]

  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j]
  setValue(cfg, VERSIONS)

  compta.dds = new DateJour().nbj
  avatar.dds = ddsAvatarGroupe(0)
  const avrsa1 = { id: avatar.id, clepub: args.clePubAv, vsh: 0 }
  const avrsa2 = { id: compte.id, clepub: args.clePubC, vsh: 0 }
  const dh = new Date().getTime()
  const ardoise = { id: compte.id, v: dh, dhl:dh, mcp: null, mcc: null, data: null, vsh: 0 }

  cfg.db.transaction(creationCompteTr)(cfg, session, compte, compta, prefs, ardoise, avatar, avrsa1, avrsa2)

  result.rowItems = [newItem('compte', compte), newItem('compta', compta), newItem('ardoise', ardoise), newItem('prefs', prefs), newItem('avatar', avatar)]    
  return result
}
m1fonctions.creationCompte = creationCompte

function creationCompteTr (cfg, session, compte, compta, prefs, ardoise, avatar, avrsa1, avrsa2) {
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
  if (c) {
    if (c.pcbh === compte.pcbh) {
      throw new AppExc(X_SRV, 'Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(X_SRV, 'Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
    }
  }

  stmt(cfg, inscompte).run(compte)
  stmt(cfg, inscompta).run(compta)
  stmt(cfg, insavatar).run(avatar)
  stmt(cfg, insardoise).run(ardoise)
  stmt(cfg, insprefs).run(prefs)
  stmt(cfg, insavrsa).run(avrsa1)
  stmt(cfg, insavrsa).run(avrsa2)

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
  // cols: ['id', 'vcv', 'st', 'cva']
  rowItems.push(newItem('cv', { id: id, vcv: v, st: a.st, cva: cva }))
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
  const compta = stmt(cfg, selcomptaid).get({ id: c.id })
  if (!compta) {
    throw new AppExc(X_SRV, 'Compte corrompu : données de comptabilité absentes')
  }
  const ardoise = stmt(cfg, selardoiseid).get({ id: c.id })
  if (!ardoise) {
    throw new AppExc(X_SRV, 'Compte corrompu : données des échanges avec parrain / comptable absentes')
  }
  result.compte = newItem('compte', c)
  result.prefs = newItem('prefs', p)
  result.compta = newItem('compta', compta)
  result.ardoise = newItem('ardoise', ardoise)
  if (cfg.comptables.indexOf(c.pcbh) !== -1) result.estComptable = true
  return result
}
m1fonctions.connexionCompte = connexionCompte

/**************************************** */
const selavgrvqid = ''
const updavgrvq = ''

const selavatar = 'SELECT * FROM avatar WHERE id = @id AND v > @v'
const selsecret = 'SELECT * FROM secret WHERE id = @id AND v > @v'
const selcontact = 'SELECT * FROM contact WHERE id = @id AND v > @v'
const selardoise = 'SELECT * FROM ardoise WHERE id = @id '
const selcontactIdIc = 'SELECT * FROM contact WHERE id = @id AND ic = @ic'
const selrencontre = 'SELECT * FROM rencontre WHERE id = @id AND v > @v'
const selparrain = 'SELECT * FROM parrain WHERE id = @id AND v > @v'
const selgroupe = 'SELECT * FROM groupe WHERE id = @id AND v > @v'
const selmembre = 'SELECT * FROM membre WHERE id = @id AND v > @v'

const updardoise = 'UPDATE ardoise SET v = @v, data = @data, vsh = @vsh WHERE id = @id'

/****************************************
Echange sur l'ardoise : args
- `idp` : id du parrain
- `idf` : id du filleul
- `em` : émis par, 0 - le compte, 1 - son parrain, 2 - le comptable
- `texte` : court.
Ecriture de 1 ou 2 rows (voire 0 !étrange!) selon que le parrain et/ou le filleul existe
Ardoise.data : serial crypté soft de [ {dh, idf, idp, em, texte} ]
*/
async function echangeArdoise (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(echangeArdoiseTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.echangeArdoise = echangeArdoise

function echangeArdoiseTr (cfg, args, rowItems) {
  const dh = new Date().getTime()
  if (args.idf) {
    const row= stmt(cfg, selardoise).get({ id: args.idf })
    if (row) {
      const x = row.data ? deserial(crypt.decryptersoft(row.data)) : []
      const y = [{ dh: dh, idp: args.idp, idf: args.idf, em: args.em, texte: args.texte}]
      x.forEach(e => { if (y.length < NBEARD || (dh - e.dh < ANCARD)) y.push(e) })
      row.data = crypt.cryptersoft(serial(y))
      row.v = dh
      stmt(cfg, updardoise).run(row)
      rowItems.push(newItem('ardoise', row))
    }
  }
  if (args.idp) {
    const row= stmt(cfg, selardoise).get({ id: args.idp })
    if (row) {
      const x = row.data ? deserial(crypt.decryptersoft(row.data)) : []
      const y = [{ dh: dh, idp: args.idp, idf: args.idf, em: args.em, texte: args.texte}]
      x.forEach(e => { if (y.length < NBEARD || (dh - e.dh < ANCARD)) y.push(e) })
      row.data = crypt.cryptersoft(serial(y))
      row.v = dh
      stmt(cfg, updardoise).run(row)
      rowItems.push(newItem('ardoise', row))
    }
  }
}

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
Chargement des invitGr des avatars d'un compte
- sessionId, ids (array des ids des avatars)
*/
const selinvitgr = 'SELECT * FROM invitgr WHERE id = @id'

async function chargerInvitGr (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc(), rowItems: [] }
  for (let i = 0; i < args.ids.length; i++) {
    const rows = stmt(cfg, selinvitgr).all({ id: args.ids[i] })
    rows.forEach((row) => {
      result.rowItems.push(newItem('invitgr', row))
    })
  }
  return result
}
m1fonctions.chargerInvitGr = chargerInvitGr

/*****************************************
Création d'un invitGr
- sessionId, id, ni, datap
*/
const insinvitgr = 'INSERT INTO invitgr (id, ni, datap) VALUES (@id, @ni, @datap)'

async function creerInvitGr (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const row = { id: args.id, ni: args.id, nomcp: args.datap }
  const rowItems = [row]
  cfg.db.transaction(creerInvitGrTr)(cfg, row)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.creerInvitGr = creerInvitGr

function creerInvitGrTr (cfg, row) {
  stmt(cfg, insinvitgr).run(row)
}

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

/******************************************
Abonnement de la session aux compte et listes d'avatars et de groupes et signatures
- sessionId
- idc : id du compte
- lav : array des ids des avatars
- lgr : array des ids des groupes
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

const updddsc = 'UPDATE compta SET dds = @dds WHERE id = @id'
const updddsa= 'UPDATE avatar SET dds = @dds WHERE id = @id'
const updddsg = 'UPDATE groupe SET dds = @dds WHERE id = @id'
const ddsc = 'SELECT dds FROM compta WHERE id = @id'
const ddsa = 'SELECT dds FROM avatar WHERE id = @id'
const ddsg = 'SELECT dds FROM groupe WHERE id = @id'

function signaturesTr (cfg, idc, lav, lgr) {
  const a = stmt(cfg, ddsc).get({ id: idc })
  const j = new DateJour().nbj
  if (a < j) stmt(cfg, updddsc).run({ id: idc, dds:j })

  lav.forEach((id) => {
    const a = stmt(cfg, ddsa).get({ id: id })
    const j = ddsAvatarGroupe(a)
    if (a < j) stmt(cfg, updddsa).run({ id: id, dds: j })
  })

  lgr.forEach((id) => {
    const a = stmt(cfg, ddsg).get({ id: id })
    const j = ddsAvatarGroupe(a)
    if (a < j) stmt(cfg, updddsg).run({ id: id, dds: j })
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
    args.lcvmaj.forEach((id) => { lst.push(id) })
    // lst.push(3382219599812300) pour tester la syntaxe IN
    const st = cfg.db.prepare(selcv1 + lst.join(',') + ')')
    const rows = st.all({ vcv: args.vcv })
    for (const row of rows) {
      rowItems.push(newItem('cv', row))
    }
  }
  
  if (args.lcvchargt.length) {
    const lst = []
    args.lcvchargt.forEach((id) => { lst.push(id) })
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
- { ts, id: s.id, ns: s.ns, cle, idc, buf, lg, id2, ns2 }
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

  let secid = crypt.idToSid(args.id) + '@' + crypt.idToSid(args.ns)
  if (args.ts === 1 && args.id2 < args.id) secid = crypt.idToSid(args.id2) + '@' + crypt.idToSid(args.ns2)

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
 * Parrainage : args de m1/nouveauParrainage
  sessionId: data.sessionId,
  rowParrain: serial(rowParrain)
 Retour : dh
 */
const insparrain = 'INSERT INTO parrain (pph, id, v, st, dlv, datak, datax, data2k, ardc, vsh) '
  + 'VALUES (@pph, @id, @v, @st, @dlv, @datak, @datax, @data2k, @ardc, @vsh)'
const selpphparrain = 'SELECT * FROM parrain WHERE pph = @pph'

async function nouveauParrainage (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const parrain = deserial(args.rowParrain)

  const versions = getValue(cfg, VERSIONS)
  const j = idx(parrain.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  parrain.v = versions[j] // version du row parrain

  cfg.db.transaction(nouveauParrainageTr)(cfg, parrain)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: [newItem('parrain', parrain)] })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.nouveauParrainage = nouveauParrainage

function nouveauParrainageTr (cfg, parrain) {
  const p = stmt(cfg, selpphparrain).get({ pph: parrain.pph })
  if (p) {
    console.log('Parrain : phrase déjà utilisée')
    const x = p.id === parrain.id ? ' par votre compte.' : ' par un autre compte.'
    throw new AppExc(X_SRV, 'Cette phrase de parrainage est trop proche d\'une déjà enregistrée' + x)
  }
  stmt(cfg, insparrain).run(parrain)
}

/******************************************************************
 * Acceptation
    sessionId: data.sessionId,
    pph: arg.pph,
    idf: parrain.naf.id,
    idp: parrain.id, // id avatar parrain
    idcp: parrain.data.idcp, // id compte parrain
    forfaits: parrain.data.f, // A déduire des ressources du row compta du parrain
    clePubAv: kpav.publicKey,
    clePubC: kpc.publicKey,
    rowCompte,
    rowPrefs,
    rowAvatar,
    rowCompta,
    rowContactP,
    rowContactF
  Refus
    sessionId: data.sessionId,
    pph: parrain.pph,
    ardc: await crypt.crypter(parrain.data.cc, serial([new Date().getTime(), arg.ard]))
 Retour : sessionId, dh, si ok : rowItems : compte, compta, prefs, avatar, contactf
 */
const inscontact = 'INSERT INTO contact (id, ic, v, st, ardc, datak, datap, mc, infok, vsh) '
 + 'VALUES (@id, @ic, @v, @st, @ardc, @datak, @datap, @mc, @infok, @vsh)'
const upd1parrain = 'UPDATE parrain SET v = @v, st = @st, ardc = @ardc WHERE pph = @pph'
const updcompta = 'UPDATE compta SET v = @v, data = @data WHERE id = @id'

async function acceptParrainage (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const compte = schemas.deserialize('rowcompte', args.rowCompte)
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)
  const compta = schemas.deserialize('rowcompta', args.rowCompta)
  const prefs = schemas.deserialize('rowprefs', args.rowPrefs)
  const contactf = schemas.deserialize('rowcontact', args.rowContactF)
  const contactp = schemas.deserialize('rowcontact', args.rowContactP)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idp)
  versions[j]++
  args.vp = versions[j] // version du contact parrain
  j = idx(args.idf)
  versions[j]++
  args.vf = versions[j] // version du contact filleul 
  j = idx(args.idcp)
  versions[j]++
  args.vcp = versions[j] // version du compte parrain 
  j = idx(compte.id)
  versions[j]++
  args.vcf = versions[j] // version du compte filleul 
  setValue(cfg, VERSIONS)

  const items = {} // contiendra après l'appel : parrain, comptaP (du parrain), ardoise (du filleul)

  cfg.db.transaction(acceptParrainageTr)(cfg, session, args, compte, compta, prefs, avatar, contactf, contactp, items)

  const i10 = newItem('parrain', items.parrain)
  const i11 = newItem('parrain', items.comptaP)
  const i12 = newItem('ardoise', items.ardoise)
  const i1 = newItem('contact', contactp)
  const i2 = newItem('contact', contactf)
  const i3 = newItem('compte', compte)
  const i4 = newItem('avatar', avatar)
  const i5 = newItem('prefs', prefs)
  const i6 = newItem('compta', compta)
  result.rowItems = [i2, i3, i4, i5, i6, i12] // à retourner en résultat
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: [i10, i11, i1, i2, i3, i4, i5, i6, i12] }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.acceptParrainage = acceptParrainage
  
function acceptParrainageTr (cfg, session, args, compte, compta, prefs, avatar, contactf, contactp, items) {
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
  if (c) {
    if (c.pcbh === compte.pcbh) {
      throw new AppExc(X_SRV, 'Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(X_SRV, 'Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
    }
  }

  const p = stmt(cfg, selpphparrain).get({ pph: args.pph })
  if (!p) {
    throw new AppExc(X_SRV, 'Phrase de parrainage inconnue')
  }
  const st = Math.floor(p.st / 10) 
  if (st !== 0) {
    throw new AppExc(X_SRV, 'Ce parrainage a déjà fait l\'objet ' + (st === 1 ? 'd\'une acceptation.' : 'd\'un refus'))
  }
  // MAJ du row parrain : v, st, ardc
  p.v = args.vp
  p.ardc = contactf.ardc
  p.st = 1
  stmt(cfg, upd1parrain).run(p)
  items.parrain = p

  const comptaP = stmt(cfg, selcomptaid).get({ id: args.idcp })
  if (!comptaP) {
    throw new AppExc(X_SRV, 'Compte parrain corrompu : données de comptabilité absentes')
  }
  const compteurs = new Compteurs(comptaP.data)
  const ok = compteurs.setRes(-args.forfaits[0], -args.forfaits[1])
  if (!ok) {
    throw new AppExc(X_SRV, 'Réserves de volume insuffisantes du parrain pour attribuer ces forfaits')
  }
  comptaP.v = args.vcp
  comptaP.data = compteurs.serial
  stmt(cfg, updcompta).run(comptaP)
  items.comptaP = comptaP

  const dh = new Date().getTime()
  const ardoise = { id: compte.id, v: dh, dhl:dh, mcp: null, mcc: null, data: null, vsh: 0 }
  stmt(cfg, insardoise).run(ardoise)
  items.ardoise = ardoise

  // insertion des contacts p et f : v
  contactp.v = args.vp
  stmt(cfg, inscontact).run(contactp)

  contactf.v = args.vf
  stmt(cfg, inscontact).run(contactf)

  // Insertion des nouveaux compte, avatar, prefs du filleul
  compte.v = args.vcf
  stmt(cfg, inscompte).run(compte)

  compta.v = args.vcf
  compta.dds = new DateJour().nbj
  stmt(cfg, inscompta).run(compta)

  prefs.v = args.vcf
  stmt(cfg, insprefs).run(prefs)

  avatar.v = args.vf
  avatar.dds = ddsAvatarGroupe(0)
  stmt(cfg, insavatar).run(avatar)

  // Clé RSA du filleul
  const avrsaAv = { id: avatar.id, clepub: args.clePubAv, vsh: 0 }
  stmt(cfg, insavrsa).run(avrsaAv)

  const avrsaC = { id: compte.id, clepub: args.clePubC, vsh: 0 }
  stmt(cfg, insavrsa).run(avrsaC)

  // Contexte de session du filleul
  session.compteId = compte.id
  session.plusAvatars([avatar.id])
  session.plusCvs([contactp.id])
}

/******************************************************************
Refus
  sessionId: data.sessionId,
  pph: parrain.pph,
  ardc: await crypt.crypter(parrain.data.cc, serial([new Date().getTime(), arg.ard]))
 Retour : sessionId, dh
*/

async function refusParrainage (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const parrain = stmt(cfg, selpphparrain).get({ pph: args.pph })
  if (!parrain) {
    throw new AppExc(X_SRV, 'Phrase de parrainage inconnue')
  }
  const st = Math.floor(parrain.st / 10) 
  if (st !== 0) {
    throw new AppExc(X_SRV, 'Ce parrainage a déjà fait l\'objet ' + (st === 1 ? 'd\'une acceptation.' : 'd\'un refus'))
  }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(parrain.id)
  versions[j]++
  parrain.v = versions[j] // version du compte parrain
  parrain.st = 2
  parrain.ardc = args.ardc

  cfg.db.transaction(refusParrainageTr)(cfg, parrain)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: [newItem('parrain', parrain)] }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.refusParrainage = refusParrainage
  
function refusParrainageTr (cfg, parrain) {
  stmt(cfg, upd1parrain).run(parrain)
}

/* row parrain depuis la phrase de parrainage */
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

/* Régularisation Groupe *****************************************/
/* args
- id : de l'avatar
- ni : numéro d'invitation du groupe à inscrire
- datak : [nom, rnd, im] du groupe à inscrire
*/

const upd1avatar = 'UPDATE avatar SET v = @v, lgrk = @lgrk WHERE id = @id'
const delinvitgr = 'DELETE from invitgr WHERE id = @id AND ni = @ni'

async function regulGr (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version des rows parrain
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(regulGrTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.regulGR = regulGr

function regulGrTr (cfg, args, rowItems) {
  const a = stmt(cfg, selavatarid).get({ id: args.id })
  if (!a) return // étrange
  const map = deserial(a.lgrk)
  if (map[args.ni]) return // déjà fait
  map[args.ni] = args.datak
  a.v = args.v
  stmt(cfg, upd1avatar).run(a)
  rowItems.push(newItem('avatar', a))
  stmt(cfg, delinvitgr).run({ id: args.id, ni: args.ni })
}

/* Régularisation Contact *****************************************/
/* args
- id : de l'avatar
- ic : index du contact
- datak : datak à insrire et mise à null de datap
*/

const upd2contact = 'UPDATE contact SET v = @v, datak = @datak, datap = null WHERE id = @id AND ic = @ic'

async function regulCt (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version des rows parrain
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(regulCtTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.regulCt = regulCt

function regulCtTr (cfg, args, rowItems) {
  const c = stmt(cfg, selcontactIdIc).get({ id: args.id, ic: args.ic })
  if (!c || c.datap === null) return // étrange ou déjà fait
  c.c = args.v
  c.datak = args.datak
  stmt(cfg, upd2contact).run(c)
  rowItems.push(newItem('contact', c))
}
