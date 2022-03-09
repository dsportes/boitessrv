import { crypt } from './crypto.mjs'
import { getdhc, sleep, deserial, serial, mcsToU8, u8ToMcs } from './util.mjs'
import { getSession, syncListQueue, processQueue } from './session.mjs'
import { AppExc, X_SRV, E_WS, A_SRV, INDEXT, DateJour, Compteurs, MC } from './api.mjs'
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
  if (!session) throw new AppExc(E_WS, '01-Session interrompue. Se déconnecter et tenter de se reconnecter')
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
const selavatarid = 'SELECT * FROM avatar WHERE id = @id'
const selsecretidns = 'SELECT * FROM secret WHERE id = @id AND ns = @ns'
const selcompteid = 'SELECT * FROM compte WHERE id = @id'

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
    throw new AppExc(X_SRV, '02-Cette phrase secrète n\'est pas reconnue comme étant l\'une des comptables de l\'organisation')
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

  versions[0]++
  avatar.vcv = versions[0]
  setValue(cfg, VERSIONS)

  compta.dds = new DateJour().nbj
  avatar.dds = ddsAvatarGroupe(0)
  const avrsa1 = { id: avatar.id, clepub: args.clePubAv, vsh: 0 }
  const avrsa2 = { id: compte.id, clepub: args.clePubC, vsh: 0 }
  const dh = new Date().getTime()
  const ardoise = { id: compte.id, v: compte.vh, dhe: dh, dhl: dh, mcp: null, mcc: null, data: null, vsh: 0 }

  cfg.db.transaction(creationCompteTr)(cfg, session, compte, compta, prefs, ardoise, avatar, avrsa1, avrsa2)

  result.rowItems = [newItem('compte', compte), newItem('compta', compta), newItem('ardoise', ardoise), newItem('prefs', prefs), newItem('avatar', avatar)]    
  return result
}
m1fonctions.creationCompte = creationCompte

function creationCompteTr (cfg, session, compte, compta, prefs, ardoise, avatar, avrsa1, avrsa2) {
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
  if (c) {
    if (c.pcbh === compte.pcbh) {
      throw new AppExc(X_SRV, '03-Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(X_SRV, '04-Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
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

/* Creation nouvel avatar ****************************************
- sessionId, clePub, idc (numéro du compte), vcav, mack, rowAvatar
Retour :
- sessionId
- dh
- statut : 0:OK, 1:retry (version compte ayant évolué)
*/
function creationAvatar (cfg, args) {
  const session = checkSession(args.sessionId)

  const result = { sessionId: args.sessionId, dh: getdhc() }
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc2 = versions[j]

  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j]

  versions[0]++
  avatar.vcv = versions[0]
  setValue(cfg, VERSIONS)

  avatar.dds = ddsAvatarGroupe(0)
  const avrsa = { id: avatar.id, clepub: args.clePub, vsh: 0 }

  const rowItems = []
  cfg.db.transaction(creationAvatarTr)(cfg, session, args, avatar, avrsa, rowItems)

  if (args.statut === 1) {
    result.statut = 1
    return result
  }

  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.statut = 0
  return result
}
m1fonctions.creationAvatar = creationAvatar

const upd1compte = 'UPDATE compte SET v = @v, mack = @mack WHERE id = @id'

function creationAvatarTr (cfg, session, args, avatar, avrsa, rowItems) {
  const c = stmt(cfg, selcompteid).get({ id: args.idc })
  if (!c) throw new AppExc(A_SRV, '06-Compte non trouvé')
  if (c && c.v !== args.vcav) {
    args.statut = 1
    return
  }
  c.v = args.vc2
  c.mack = args.mack

  stmt(cfg, upd1compte).run(c)
  stmt(cfg, insavatar).run(avatar)
  stmt(cfg, insavrsa).run(avrsa)

  rowItems.push(newItem('compte', c))
  rowItems.push(newItem('avatar', avatar))
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
  if (!p) throw new AppExc(X_SRV, '06-Compte non trouvé')

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
  if (!a) throw new AppExc(A_SRV, '07-Avatar non trouvé')

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
    throw new AppExc(X_SRV, '08-Compte non authentifié : aucun compte n\'est déclaré avec cette phrase secrète')
  }
  const p = stmt(cfg, selprefsid).get({ id: c.id })
  if (!p) throw new AppExc(A_SRV, '09-Données de préférence absentes')

  const compta = stmt(cfg, selcomptaid).get({ id: c.id })
  if (!compta) throw new AppExc(A_SRV, '10-Données de comptabilité absentes')
  const ardoise = stmt(cfg, selardoise).get({ id: c.id })
  if (!ardoise) throw new AppExc(A_SRV, '11-Données des échanges avec parrain / comptable absentes')

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
const selgroupeId = 'SELECT * FROM groupe WHERE id = @id'
const selmembre = 'SELECT * FROM membre WHERE id = @id AND v > @v'
const selmembreIdIm = 'SELECT * FROM membre WHERE id = @id AND im = @im'

const updardoise1 = 'UPDATE ardoise SET v = @v, dhe = @dhe, mcp = @mcp, mcc = @mcc, data = @data, vsh = @vsh WHERE id = @id'
const updardoise2 = 'UPDATE ardoise SET v = @v, dhl = @dhl, data = @data, vsh = @vsh WHERE id = @id'
const updardoise3 = 'UPDATE ardoise SET v = @v, mcp = @mcp, data = @data, vsh = @vsh WHERE id = @id'
const updardoise4 = 'UPDATE ardoise SET v = @v, mcc = @mcc, data = @data, vsh = @vsh WHERE id = @id'

/****************************************
Get ardoise par son id
- `sessionId`
- `id` : id du compte titulaire
Retour : sessionId, dh, ardoise
*/
async function getArdoise (cfg, args) {
  checkSession(args.sessionId)
  args.dh = getdhc()
  const result = { sessionId: args.sessionId, dh: args.dh }
  const row = stmt(cfg, selardoise).get({ id: args.id })
  result.ardoise = row ? newItem('ardoise', row) : null
  return result
}
m1fonctions.getArdoise = getArdoise

/****************************************
Get ardoises des filleuls d'un parrain
- `sessionId`
- `id` : id du parrain
Retour : sessionId, dh, ardoise
*/
const selardoisesF = 'SELECT * FROM ardoise WHERE id IN '
  + '(SELECT id FROM compta WHERE idp = @id)'

async function getArdoisesFilleuls (cfg, args) {
  checkSession(args.sessionId)
  args.dh = getdhc()
  const result = { sessionId: args.sessionId, dh: args.dh }
  const rowItems = []
  const rows = stmt(cfg, selardoisesF).all({ id: args.id })
  for (const row of rows) {
    rowItems.push(newItem('ardoise', row))
  }
  result.ardoises = rowItems
  return result
}
m1fonctions.getArdoisesFilleuls = getArdoisesFilleuls

/** Echange ardoise **************************************
- `id` : du compte.
- `v` :
- `dhe` : date-heure de dernière mise à jour.
- `dhl` : date-heure de dernière lecture par le titulaire
- `mcp` : mots clés du parrain - String de la forme `245/232/114/`
- `mcc` : mots clés du comptable
- `data`: contenu sérialisé _crypté soft_ de l'ardoise. Array des échanges :
  - `dh` : date-heure d'écriture de l'échange
  - `aut`: auteur : 0:titulaire du compte, 1:parrain du compte, 2:comptable
  - `texte`: texte
- `vsh`:
Echange sur l'ardoise : args
- sessionId
- `id` : id du compte titulaire
- `aut` : émis par, 0 - le compte, 1 - son parrain, 2 - le comptable
- `texte` : texte.
Insertion d'un échange en tête. Mots clés "nouveau" ajoutés
Ardoise.data : serial crypté soft de [ {dh, idf, idp, em, texte} ]
*/
async function echangeArdoise (cfg, args) {
  checkSession(args.sessionId)
  args.dh = getdhc()
  const result = { sessionId: args.sessionId, dh: args.dh }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  args.v = versions[j]

  cfg.db.transaction(echangeArdoiseTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.echangeArdoise = echangeArdoise

function echangeArdoiseTr (cfg, args, rowItems) {
  const row = stmt(cfg, selardoise).get({ id: args.id })
  if (!row) return // ne devrait pas arriver : compte perdu ?
  const x = row.data ? deserial(crypt.decryptersoft(row.data)) : []
  const y = [{ dh: args.dh, em: args.em, texte: args.texte}]
  x.forEach(e => { if (y.length < NBEARD || (args.dh - e.dh < ANCARD)) y.push(e) })
  row.data = crypt.cryptersoft(serial(y))
  row.dhe = args.dh
  row.v = args.v
  const mcp = row.mcp ? mcsToU8(row.mcp) : new Uint8Array()
  const mcc = row.mcp ? mcsToU8(row.mcc) : new Uint8Array()
  if (args.aut === 0) {
    if (mcp.indexOf(MC.NOUVEAU) === -1) {
      mcp.push(MC.NOUVEAU)
      row.mcp = u8ToMcs(mcp)
    }
    if (mcc.indexOf(MC.NOUVEAU) === -1) {
      mcc.push(MC.NOUVEAU)
      row.mcc = u8ToMcs(mcc)
    }
  } else if (args.aut === 1) {
    if (mcc.indexOf(MC.NOUVEAU) === -1) {
      mcc.push(MC.NOUVEAU)
      row.mcc = u8ToMcs(mcc)
    }
  } else  if (args.aut === 2) {
    if (mcp.indexOf(MC.NOUVEAU) === -1) {
      mcp.push(MC.NOUVEAU)
      row.mcp = u8ToMcs(mcp)
    }
  }
  stmt(cfg, updardoise1).run(row)
  rowItems.push(newItem('ardoise', row))
}
/**Lecture ardoise par le compte *******************************
Args : sessionId, id
*/
async function lectureArdoise (cfg, args) {
  args.dh = getdhc()
  const result = { sessionId: args.sessionId, dh: args.dh }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  args.v = versions[j]

  cfg.db.transaction(lectureArdoiseTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.lectureArdoise = lectureArdoise

function lectureArdoiseTr (cfg, args, rowItems) {
  const row = stmt(cfg, selardoise).get({ id: args.id })
  if (!row) return // ne devrait pas arriver : compte perdu ?

  const x = row.data ? deserial(crypt.decryptersoft(row.data)) : []
  const y = []
  x.forEach(e => { if (y.length < NBEARD || (args.dh - e.dh < ANCARD)) y.push(e) })
  row.data = crypt.cryptersoft(serial(y))

  row.dhl = args.dhl
  row.v = args.v
  stmt(cfg, updardoise2).run(row)
  rowItems.push(newItem('ardoise', row))
}

/**Mots clés parrain ardoise *******************************
Args : sessionId, id, mc (string)
*/
async function mcpArdoise (cfg, args) {
  args.dh = getdhc()
  const result = { sessionId: args.sessionId, dh: args.dh }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  args.v = versions[j]

  cfg.db.transaction(mcpArdoiseTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.mcpArdoise = mcpArdoise

function mcpArdoiseTr (cfg, args, rowItems) {
  const row = stmt(cfg, selardoise).get({ id: args.id })
  if (!row) return // ne devrait pas arriver : compte perdu ?

  const x = row.data ? deserial(crypt.decryptersoft(row.data)) : []
  const y = []
  x.forEach(e => { if (y.length < NBEARD || (args.dh - e.dh < ANCARD)) y.push(e) })
  row.data = crypt.cryptersoft(serial(y))

  row.mcp = args.mc
  row.v = args.v
  stmt(cfg, updardoise3).run(row)
  rowItems.push(newItem('ardoise', row))
}

/**Mots clés comptable ardoise *******************************
Args : sessionId, id, mc (string)
*/
async function mccArdoise (cfg, args) {
  args.dh = getdhc()
  const result = { sessionId: args.sessionId, dh: args.dh }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  setValue(cfg, VERSIONS)
  args.v = versions[j]

  cfg.db.transaction(mccArdoiseTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.mccArdoise = mccArdoise

function mccArdoiseTr (cfg, args, rowItems) {
  const row = stmt(cfg, selardoise).get({ id: args.id })
  if (!row) return // ne devrait pas arriver : compte perdu ?

  const x = row.data ? deserial(crypt.decryptersoft(row.data)) : []
  const y = []
  x.forEach(e => { if (y.length < NBEARD || (args.dh - e.dh < ANCARD)) y.push(e) })
  row.data = crypt.cryptersoft(serial(y))

  row.mcc = args.mc
  row.v = args.v
  stmt(cfg, updardoise4).run(row)
  rowItems.push(newItem('ardoise', row))
}

/* Régularisation Groupe ****************************************
Mise à jour de lgck dans l'avatar et suppression du row invitgr
args
- id : de l'avatar
- idg: id du groupe
- ni : numéro d'invitation du groupe à inscrire
- nomck : [nom, rnd, im] du groupe à inscrire dans lgrk de l'avatar
*/

const upd1avatar = 'UPDATE avatar SET v = @v, lgrk = @lgrk WHERE id = @id'
const delinvitgr = 'DELETE from invitgr WHERE id = @id AND ni = @ni'

async function regulGr (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version des rows parrain
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(regulGrTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.regulGr = regulGr

function regulGrTr (cfg, session, args, rowItems) {
  const a = stmt(cfg, selavatarid).get({ id: args.id })
  if (!a) return // avatar supprimé depuis (?)
  const map = deserial(a.lgrk)
  if (map[args.ni]) return // déjà fait
  map[args.ni] = args.nomck
  a.v = args.v
  a.lgrk = serial(map)
  stmt(cfg, upd1avatar).run(a)
  rowItems.push(newItem('avatar', a))
  stmt(cfg, delinvitgr).run({ id: args.id, ni: args.ni })
  session.plusGroupes([args.idg])
}

/* Régularisation Avatar ****************************************
Suppression des entrées de lgck dans les avatars correspondant aux groupes supprimés
args
- mapav : une entrée par id d'avatar. Valeur : liste des ni des groupes à supprimer
*/

async function regulAv (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  args.v = {}
  for (const avid of args.mapav) {
    const j = idx(avid)
    versions[j]++
    args.v[avid] = versions[j]
  }
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(regulAvTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.regulAv = regulAv

function regulAvTr (cfg, session, args, rowItems) {
  for (const avid of args.v) {
    const a = stmt(cfg, selavatarid).get({ id: avid })
    if (!a) continue // avatar supprimé depuis (?)
    const map = deserial(a.lgrk)
    args.mapav[avid].forEach(ni => {
      delete map[ni]
    })
    a.v = args.v[avid]
    a.lgrk = serial(map)
    stmt(cfg, upd1avatar).run(a)
    rowItems.push(newItem('avatar', a))
  }
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
  if (!a || a.v1 > a.q1 || a.vm1 > a.qm1) throw new AppExc(X_SRV, '12-Forfait dépassé')

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
  if (!secret) throw new AppExc(A_SRV, '13-Secret inexistant')

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
      throw new AppExc(X_SRV, '12-Forfait dépassé')
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
  if (!secret) throw new AppExc(A_SRV, '13-Secret inexistant')

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
      throw new AppExc(X_SRV, '12-Forfait dépassé')
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
  if (!secret) throw new AppExc(A_SRV, '13-Secret inexistant')

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
const upd9parrain = 'UPDATE parrain SET id = @id, v = @v, st = @st, dlv = @dlv, '
  + 'datak = @datak, datax = @datax, data2k = @data2k, ardc = @ardc, vsh = @vsh WHERE pph = @pph'
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
    if (p.st >= 0) {
      const x = p.id === parrain.id ? ' par votre compte.' : ' par un autre compte.'
      throw new AppExc(X_SRV, '14-Cette phrase de parrainage est trop proche d\'une déjà enregistrée' + x)
    }
    stmt(cfg, upd9parrain).run(parrain)
  } else {
    stmt(cfg, insparrain).run(parrain)
  }
}

/******************************************************************
 * Acceptation
    sessionId: data.sessionId,
    pph: arg.pph,
    idf: parrain.naf.id,
    idp: parrain.id, // id avatar parrain
    idcp: parrain.data.idcp, // id compte parrain : pour maj de son row compta
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
const upd2parrain = 'UPDATE parrain SET v = @v, st = @st, dlv = 0, ardc = null, datax = null, datak = null, data2k = null WHERE pph = @pph'
const upd3parrain = 'UPDATE parrain SET v = @v, dlv = @dlv WHERE pph = @pph'

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
  args.vcp = versions[j] // version du compte parrain (L'AUTRE)

  j = idx(compte.id)
  versions[j]++
  args.vcf = versions[j] // version du compte filleul (MOI)

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
      throw new AppExc(X_SRV, '03-Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(X_SRV, '04-Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
    }
  }

  const p = stmt(cfg, selpphparrain).get({ pph: args.pph })
  if (!p) throw new AppExc(X_SRV, '15-Phrase de parrainage inconnue')

  if (p.st !== 0) throw new AppExc(X_SRV, '16-Ce parrainage a déjà fait l\'objet ' + (p.st !== 1 ? 'd\'une acceptation.' : 'd\'un refus'))

  // MAJ du row parrain : v, st, ardc
  p.v = args.vp
  p.ardc = contactf.ardc
  p.st = contactp.st % 10 === 0 ? 2 : 3
  stmt(cfg, upd1parrain).run(p)
  items.parrain = p

  const comptaP = stmt(cfg, selcomptaid).get({ id: args.idcp })
  if (!comptaP) {
    throw new AppExc(A_SRV, '17-Compte parrain : données de comptabilité absentes')
  }
  const compteurs = new Compteurs(comptaP.data)
  const ok = compteurs.setRes(-args.forfaits[0], -args.forfaits[1])
  if (!ok) throw new AppExc(X_SRV, '18-Réserves de volume insuffisantes du parrain pour attribuer ces forfaits')

  comptaP.v = args.vcp
  comptaP.data = compteurs.serial
  stmt(cfg, updcompta).run(comptaP)
  items.comptaP = comptaP

  const dh = new Date().getTime()
  const ardoise = { id: compte.id, v: compte.vh, dhe: dh, dhl: dh, mcp: null, mcc: null, data: null, vsh: 0 }
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
  if (!parrain) throw new AppExc(X_SRV, '15-Phrase de parrainage inconnue')

  if (parrain.st !== 0) throw new AppExc(X_SRV, '16-Ce parrainage a déjà fait l\'objet ' + (parrain.st !== 1 ? 'd\'une acceptation.' : 'd\'un refus'))

  const versions = getValue(cfg, VERSIONS)
  const j = idx(parrain.id)
  versions[j]++
  parrain.v = versions[j] // version du compte parrain
  parrain.st = 1
  parrain.ardc = args.ardc
  setValue(cfg, VERSIONS)

  cfg.db.transaction(refusParrainageTr)(cfg, parrain)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: [newItem('parrain', parrain)] }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.refusParrainage = refusParrainage
  
function refusParrainageTr (cfg, parrain) {
  stmt(cfg, upd1parrain).run(parrain)
}

/******************************************************************
Suppression / prolongation parrainage
  sessionId: data.sessionId,
  pph: parrain.pph,
  ardc: await crypt.crypter(parrain.data.cc, serial([new Date().getTime(), arg.ard]))
 Retour : sessionId, dh
*/

async function supprParrainage (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const parrain = stmt(cfg, selpphparrain).get({ pph: args.pph })
  if (!parrain) throw new AppExc(X_SRV, '15-Phrase de parrainage inconnue')

  if (parrain.st !== 0) throw new AppExc(X_SRV, '16-Ce parrainage a déjà fait l\'objet ' + (parrain.st !== 1 ? 'd\'une acceptation.' : 'd\'un refus'))

  const versions = getValue(cfg, VERSIONS)
  const j = idx(parrain.id)
  versions[j]++
  parrain.v = versions[j] // version du compte parrain
  setValue(cfg, VERSIONS)

  if (args.dlv) {
    parrain.dlv = args.dlv
  } else {
    parrain.st = new DateJour().dateSuppr
  }

  cfg.db.transaction(supprParrainageTr)(cfg, parrain)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: [newItem('parrain', parrain)] }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.supprParrainage = supprParrainage
  
function supprParrainageTr (cfg, parrain) {
  stmt(cfg, parrain.st < 0 ? upd2parrain : upd3parrain).run(parrain)
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

/******************************************************************
Maj Contact
  sessionId: data.sessionId,
  id: contact.id,
  ic: contact.ic,
  idb: contact.id2,
  icb: contact.ic2,
  nccc,
  ardc,
  infok: arg.info === contact.info ? null : await crypt.crypter(data.clek, arg.info),
  mc: arg.mc
 Retour : sessionId, dh
*/

async function majContact (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.id)
  versions[j]++
  args.va = versions[j] // version du contact A

  j = idx(args.idb)
  versions[j]++
  args.vb = versions[j] // version du contact B
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majContactTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majContact = majContact

const upd3contact = 'UPDATE contact SET v = @v, nccc = @nccc, ardc = @ardc, st = @st, infok = @infok WHERE id = @id AND ic = @ic'

function majContactTr (cfg, args, rowItems) {
  const ca = stmt(cfg, selcontactIdIc).get({ id: args.id, ic: args.ic })
  if (ca && ca.st >= 0) {
    ca.v = args.va
    if (args.ardc) ca.ardc = args.ardc
    if (args.mc) ca.mc = args.mc
    if (args.infok) ca.infok = args.infok
    const sty = ca.st % 10
    if (args.nccc) {
      ca.st = 10 + sty
    } else {
      ca.st = sty
    }
    stmt(cfg, upd3contact).run(ca)
    rowItems.push(newItem('contact', ca))
  }

  const cb = stmt(cfg, selcontactIdIc).get({ id: args.idb, ic: args.icb })
  if (cb && cb.st >= 0) {
    cb.v = args.vb
    if (args.ardc) cb.ardc = args.ardc
    const stx = Math.floor(cb.st / 10) * 10
    if (args.nccc) {
      cb.st = stx + 1
      cb.nccc = args.nccc
    } else {
      cb.st = stx
      cb.nccc = null
    }
    stmt(cfg, upd3contact).run(cb)
    rowItems.push(newItem('contact', cb))
  }
}

/* Création d'un groupe ****************************************
a) insertion d'un row groupe
b) insertion d'un membre animateur pour le créateur
c) inscription du groupe dans lgrk de l'avatar créateur
args :
- sessionId
- ida : id de l'avatar créateur
- ni : numéro d'inscription
- datak : [] du terme de lgrk
- rowGroupe
- rowMembre
Retour: sessionId, dh
A_SRV, '17-Avatar non trouvé'
*/

async function creationGroupe (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  const groupe = deserial(args.rowGroupe)
  const membre = deserial(args.rowMembre)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(groupe.id)
  versions[j]++
  groupe.v = versions[j] // version du groupe
  groupe.dds = ddsAvatarGroupe(0)
  membre.v = versions[j]

  j = idx(args.ida)
  versions[j]++
  args.v = versions[j] // version de l'avatar
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(creationGroupeTr)(cfg, session, args, groupe, membre, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.creationGroupe = creationGroupe

const insgroupe = 'INSERT INTO groupe (id, v, dds, dfh, st, idhg, imh, cvg, v1, v2, f1, f2, mcg, vsh)'
  + 'VALUES (@id, @v, @dds, @dfh, @st, @idhg, @imh, @cvg, @v1, @v2, @f1, @f2, @mcg, @vsh)'
const insmembre = 'INSERT INTO membre (id, im, v, st, vote, mc, infok, datag, ardg, vsh)'
  + 'VALUES (@id, @im, @v, @st, @vote, @mc, @infok, @datag, @ardg, @vsh)'

function creationGroupeTr (cfg, session, args, groupe, membre, rowItems) {
  const a = stmt(cfg, selavatarid).get({ id: args.ida })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  const map = deserial(a.lgrk)
  if (!map[args.ni]) {
    map[args.ni] = args.datak
    a.v = args.v
    a.lgrk = serial(map)
    stmt(cfg, upd1avatar).run(a)
    rowItems.push(newItem('avatar', a))
  }

  stmt(cfg, insgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))

  stmt(cfg, insmembre).run(membre)
  rowItems.push(newItem('membre', membre))

  session.plusGroupes([groupe.id])
}

/* Maj CV d'un groupe ****************************************
args :
- sessionId
- idg : id du groupe
- cvg : cv cryptée par la cle G
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
*/

async function majcvGroupe (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idg)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majcvGroupeTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majcvGroupe = majcvGroupe

const updcvgroupe = 'UPDATE groupe SET v = @v, cvg = @cvg WHERE id = @id'

function majcvGroupeTr (cfg, session, args, rowItems) {
  const g = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!g) throw new AppExc(A_SRV, '18-Groupe non trouvé')
  g.v = args.v
  g.cvg = args.cvg
  stmt(cfg, updcvgroupe).run(g)
  rowItems.push(newItem('groupe', g))
}

/* Maj statut archive d'un groupe ****************************************
args :
- sessionId
- idg : id du groupe
- arch : cv cryptée par la cle G
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
*/

async function majarchGroupe (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idg)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majarchGroupeTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majarchGroupe = majarchGroupe

const updstgroupe = 'UPDATE groupe SET v = @v, st = @st WHERE id = @id'

function majarchGroupeTr (cfg, session, args, rowItems) {
  const g = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!g) throw new AppExc(A_SRV, '18-Groupe non trouvé')
  g.v = args.v
  const stx = Math.floor(g.st / 10) * 10
  g.st = stx + (args.arch ? 1 : 0)
  stmt(cfg, updstgroupe).run(g)
  rowItems.push(newItem('groupe', g))
}

/* Maj statut blocage des invitations d'un groupe ****************************************
args :
- sessionId
- idg : id du groupe
- blocage : cv cryptée par la cle G
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
*/

async function majBIGroupe (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idg)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majBIGroupeTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majBIGroupe = majBIGroupe

function majBIGroupeTr (cfg, session, args, rowItems) {
  const g = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!g) throw new AppExc(A_SRV, '18-Groupe non trouvé')
  g.v = args.v
  const sty = g.st % 10
  g.st = sty + (args.blocage ? 20 : 10)
  stmt(cfg, updstgroupe).run(g)
  rowItems.push(newItem('groupe', g))
}

/* Maj mots clés spécifiques d'un groupe ****************************************
args :
- sessionId
- idg : id du groupe
- mcg : map des mots clés cryptée par la clé G
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
*/

async function majmcGroupe (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idg)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majmcGroupeTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majmcGroupe = majmcGroupe

const updmcgroupe = 'UPDATE groupe SET v = @v, mcg = @mcg WHERE id = @id'

function majmcGroupeTr (cfg, session, args, rowItems) {
  const g = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!g) throw new AppExc(A_SRV, '18-Groupe non trouvé')
  g.v = args.v
  g.mcg = args.mcg
  stmt(cfg, updmcgroupe).run(g)
  rowItems.push(newItem('groupe', g))
}

/* Maj mots clés d'un membre d'un groupe ****************************************
args :
- sessionId
- id, im : id du membre
- mc : u8 des mots clés
Retour: sessionId, dh
A_SRV, '19-Membre non trouvé'
*/

async function majmcMembre (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majmcMembreTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majmcMembre = majmcMembre

const updmcmembre = 'UPDATE membre SET v = @v, mc = @mc WHERE id = @id AND im = @im'

function majmcMembreTr (cfg, session, args, rowItems) {
  const m = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!m) throw new AppExc(A_SRV, '19-Membre non trouvé')
  m.v = args.v
  m.mc = args.mc
  stmt(cfg, updmcmembre).run(m)
  rowItems.push(newItem('membre', m))
}

/* Maj ardoise d'un membre d'un groupe ****************************************
args :
- sessionId
- id, im : id du membre
- ardg : u8 de l'ardoise
Retour: sessionId, dh
A_SRV, '19-Membre non trouvé'
*/

async function majardMembre (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majardMembreTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majardMembre = majardMembre

const updardmembre = 'UPDATE membre SET v = @v, ardg = @ardg WHERE id = @id AND im = @im'

function majardMembreTr (cfg, session, args, rowItems) {
  const m = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!m) throw new AppExc(A_SRV, '19-Membre non trouvé')
  m.v = args.v
  m.ardg = args.ardg
  stmt(cfg, updardmembre).run(m)
  rowItems.push(newItem('membre', m))
}

/* Maj info d'un membre d'un groupe ****************************************
args :
- sessionId
- id, im : id du membre
- infok : u8
Retour: sessionId, dh
A_SRV, '19-Membre non trouvé'
*/

async function majinfoMembre (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majinfoMembreTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majinfoMembre = majinfoMembre

const updinfomembre = 'UPDATE membre SET v = @v, infok = @infok WHERE id = @id AND im = @im'

function majinfoMembreTr (cfg, session, args, rowItems) {
  const m = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!m) throw new AppExc(A_SRV, '19-Membre non trouvé')
  m.v = args.v
  m.infok = args.infok
  stmt(cfg, updinfomembre).run(m)
  rowItems.push(newItem('membre', m))
}

/* Fin d'hébergement d'un groupe ****************************************
args :
- sessionId
- idc, idg : id du compte, id = groupe
- imh : indice de l'avatar membre hébergeur
Retour: sessionId, dh
A_SRV, '10-Données de comptabilité absentes'
A_SRV, '18-Groupe non trouvé'
X_SRV, '22-Ce compte n\'est pas l\'hébergeur actuel du groupe'
*/

async function finhebGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc = versions[j]
  j = idx(args.idg)
  versions[j]++
  args.vg = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(finhebGroupeTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.finhebGroupe = finhebGroupe

const updhebgroupe= 'UPDATE groupe SET v = @v, dfh = @dfh, idhg = @idhg, imh = @imh WHERE id = @id'

function finhebGroupeTr (cfg, args, rowItems) {
  const compta = stmt(cfg, selcomptaid).get({ id: args.idc })
  if (!compta) throw new AppExc(A_SRV, '10-Données de comptabilité absentes')
  const groupe = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!groupe) throw new AppExc(A_SRV, '18-Groupe non trouvé')

  if (groupe.idhg === null || groupe.imh !== args.imh)
    throw new AppExc(X_SRV, '22-Ce compte n\'est pas l\'hébergeur actuel du groupe')

  compta.v = args.vc
  const compteurs = new Compteurs(compta.data)
  compteurs.setV1(-groupe.v1)
  compteurs.setV2(-groupe.v2)
  compta.data = compteurs.serial
  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))

  groupe.v = args.vg
  groupe.idhg = null
  groupe.imh = 0
  groupe.dfh = new DateJour().nbj
  stmt(cfg, updhebgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))
}

/* Début d'hébergement d'un groupe ****************************************
args :
- sessionId
- idc, idg : id du compte, id = groupe,
- idhg : idg crypté par la clé G du groupe
- imh : indice de l'avatar membre hébergeur
Retour: sessionId, dh
A_SRV, '10-Données de comptabilité absentes'
A_SRV, '18-Groupe non trouvé'
X_SRV, '20-Groupe encore hébergé : un nouvel hébergeur ne peut se proposer que si le groupe n\'a plus de compte hébergeur'
X_SRV, '21-Forfaits (' + f + ') insuffisants pour héberger le groupe.'
*/

async function debhebGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc = versions[j]
  j = idx(args.idg)
  versions[j]++
  args.vg = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(debhebGroupeTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.debhebGroupe = debhebGroupe

function debhebGroupeTr (cfg, args, rowItems) {
  const compta = stmt(cfg, selcomptaid).get({ id: args.idc })
  if (!compta) throw new AppExc(A_SRV, '10-Données de comptabilité absentes')
  const groupe = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!groupe) throw new AppExc(A_SRV, '18-Groupe non trouvé')

  if (groupe.idhg !== null) 
    throw new AppExc(X_SRV, '20-Groupe encore hébergé : un nouvel hébergeur ne peut se proposer que si le groupe n\'a plus de compte hébergeur')

  compta.v = args.vc
  const compteurs = new Compteurs(compta.data)
  const ok1 = compteurs.setV1(groupe.v1)
  const ok2 = compteurs.setV2(groupe.v2)
  if (!ok1 || !ok2) {
    const f = !ok1 && ok2 ? 'V1' : (ok1 && !ok2 ? 'V2' : 'V1 et V2')
    throw new AppExc(X_SRV, '21-Forfaits (' + f + ') insuffisants pour héberger le groupe.')
  }

  compta.data = compteurs.serial
  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))

  groupe.v = args.vg
  groupe.idhg = args.idhg
  groupe.imh = args.imh
  groupe.dfh = 0
  stmt(cfg, updhebgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))
}

/* Modification des volumes max d'un groupe ****************************************
args :
- sessionId
- idg : id du compte, id = groupe,
- imh : indice de l'avatar membre hébergeur
- forfaits: [max1, max2]
Retour: sessionId, dh
A_SRV, '22-Groupe hébergé par un autre compte'
X_SRV, '21-Forfaits (' + f + ') insuffisants pour héberger le groupe.'
*/

async function majvmaxGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idg)
  versions[j]++
  args.vg = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majvmaxGroupeTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majvmaxGroupe = majvmaxGroupe

const updvmaxgroupe= 'UPDATE groupe SET v = @v, f1 = @f1, f2 = @f2 WHERE id = @id'

function majvmaxGroupeTr (cfg, args, rowItems) {
  const groupe = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!groupe) throw new AppExc(A_SRV, '18-Groupe non trouvé')

  if (groupe.imh !== args.imh) 
    throw new AppExc(X_SRV, '22-Groupe hébergé par un autre compte')

  const ok1 = args.forfaits[0] > (groupe.v1 * 1000000)
  const ok2 = args.forfaits[1] > (groupe.v2 * 100000000)
  if (!ok1 || !ok2) {
    const f = !ok1 && ok2 ? 'V1' : (ok1 && !ok2 ? 'V2' : 'V1 et V2')
    throw new AppExc(X_SRV, '21-Forfaits (' + f + ') insuffisants pour héberger le groupe.')
  }
  
  groupe.v = args.vg
  groupe.f1 = args.forfaits[0]
  groupe.f2 = args.forfaits[1]
  stmt(cfg, updvmaxgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))
}
