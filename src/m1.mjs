import { crypt } from './crypto.mjs'
import { getdhc, sleep } from './util.mjs'
import { getSession, syncListQueue, processQueue } from './session.mjs'
import { AppExc, X_SRV, E_WS, A_SRV, DateJour, Compteurs, UNITEV1, UNITEV2 } from './api.mjs'
import { schemas, deserial, serial } from './schemas.mjs'
import { putFile, delFile } from './storage.mjs'

export const m1fonctions = { }
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
Si la dds actuelle de l'avatar ou du groupe ou du couple n'a pas plus de 14 jours, elle convient encore.
Sinon il faut en réattribuer une qui ait entre 0 et 14 d'âge.
*/
function ddsAvatarGroupeCouple (dds) {
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
const inscompte = 'INSERT INTO compte (id, v, dpbh, pcbh, kx, mack, vsh) '
  + 'VALUES (@id, @v, @dpbh, @pcbh, @kx, @mack, @vsh)'
const inscompta = 'INSERT INTO compta (id, idp, v, dds, st, dst, data, dh, ard, vsh) '
  + 'VALUES (@id, @idp, @v, @dds, @st, @dst, @data, @dh, @ard, @vsh)'
const insprefs = 'INSERT INTO prefs (id, v, mapk, vsh) '
  + 'VALUES (@id, @v, @mapk, @vsh)'
const insavatar = 'INSERT INTO avatar (id, v, lgrk, lcck, vsh) '
  + 'VALUES (@id, @v, @lgrk, @lcck, @vsh)'
const insavrsa = 'INSERT INTO avrsa (id, clepub, vsh) '
  + 'VALUES (@id, @clepub, @vsh)'
const inssecret = 'INSERT INTO secret (id, ns, x, v, st, xp, v1, v2, mc, txts, mfas, refs, vsh) ' +
  'VALUES (@id, @ns, @x, @v, @st, @xp, @v1, @v2, @mc, @txts, @mfas, @refs, @vsh)'
// eslint-disable-next-line no-unused-vars
const inscontact = 'INSERT INTO contact (phch, dlv, ccx, vsh) '
  + 'VALUES (@phch, @dlv, @ccx, @vsh)'
// eslint-disable-next-line no-unused-vars
const inscouple = 'INSERT INTO couple (id, v, st, v1, v2, mx10, mx20, mx11, mx21, dlv, datac, infok0, infok1, mc0, mc1, ardc, vsh) '
 + 'VALUES (@id, @v, @st, @v1, @v2, @mx10, @mx20, @mx11, @mx21, @dlv, @datac, @infok0, @infok1, @mc0, @mc1, @ardc, @vsh)'
const insgroupe = 'INSERT INTO groupe (id, v, dfh, st, mxim, idhg, imh, v1, v2, f1, f2, mcg, vsh)'
 + 'VALUES (@id, @v, @dfh, @st, @mxim, @idhg, @imh, @v1, @v2, @f1, @f2, @mcg, @vsh)'
const insmembre = 'INSERT INTO membre (id, im, v, st, vote, mc, infok, datag, ardg, vsh)'
 + 'VALUES (@id, @im, @v, @st, @vote, @mc, @infok, @datag, @ardg, @vsh)'
const insinvitgr = 'INSERT INTO invitgr (id, ni, datap) '
  + 'VALUES (@id, @ni, @datap)'
// eslint-disable-next-line no-unused-vars
const inscv = 'INSERT INTO cv (id, v, x, dds, cv, vsh) '
  + 'VALUES (@id, @v, @x, @dds, @cv, @vsh)'
// eslint-disable-next-line no-unused-vars
const instrec = 'INSERT INTO trec (id, idf, dlv) VALUES (@id, @idf, @dlv)'

const selcompteId = 'SELECT * FROM compte WHERE id = @id'
const selprefsId = 'SELECT * FROM prefs WHERE id = @id'
const selcomptaId = 'SELECT * FROM compta WHERE id = @id'
const selavatarId = 'SELECT * FROM avatar WHERE id = @id'
const selgroupeId = 'SELECT * FROM groupe WHERE id = @id'
const selcoupleId = 'SELECT * FROM couple WHERE id = @id'
const selcontactPhch = 'SELECT * FROM contact WHERE phch = @phch'
const selcvId = 'SELECT * FROM cv WHERE id = @id'
const selsecretIdNs = 'SELECT * FROM secret WHERE id = @id AND ns = @ns'
const selmembreIdIm = 'SELECT * FROM membre WHERE id = @id AND im = @im'
const selinvitgrId = 'SELECT * FROM invitgr WHERE id = @id'
const deltrecIdIdf = 'DELETE FROM trec WHERE id = @id AND idf = @idf'

function idx (id) {
  return (id % (nbVersions - 1)) + 1
}

/* Creation du compte d'un comptable ****************************************
- sessionId, clePubAv, rowCompte, rowCompta, rowAvatar, rowPrefs
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
  const cv = { id: avatar.id, v: 0, x: 0, dds: 0, cv: null, vsh: 0 }

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
  cv.v = versions[0]
  setValue(cfg, VERSIONS)

  compta.dds = new DateJour().nbj
  cv.dds = ddsAvatarGroupeCouple(0)
  const avrsa = { id: avatar.id, clepub: args.clePubAv, vsh: 0 }

  cfg.db.transaction(creationCompteTr)(cfg, session, compte, compta, prefs, avatar, cv, avrsa)

  result.rowItems = [newItem('compte', compte), newItem('compta', compta), newItem('prefs', prefs), newItem('avatar', avatar)]    
  result.estComptable = 1
  return result
}
m1fonctions.creationCompte = creationCompte

function creationCompteTr (cfg, session, compte, compta, prefs, avatar, cv, avrsa) {
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
  stmt(cfg, insprefs).run(prefs)
  stmt(cfg, inscv).run(cv)
  stmt(cfg, insavrsa).run(avrsa)

  session.compteId = compte.id
  session.plusAvatars([avatar.id])
}

/************************************************************
Connexion à un compte
Détermine si les hash de la phrase secrète en argument correspond à un compte.
RAZ des abonnements en cours et abonnement au compte
args
- dpbh
- pcbh
- vcompte vprefs vcompta
Retour
- rowCompte, rowPrefs, rowCompa (null si pas plus récent)
- estComtable si la phrase du compte est enregistrée comme comptable dans la configuration
*/
async function connexionCompte (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  cfg.db.transaction(connexionCompteTr)(cfg, args, result)
  session.setCompte(args.id) // RAZ des abonnements et abonnement au compte
  return result
}
m1fonctions.connexionCompte = connexionCompte

const selcomptedpbh = 'SELECT * FROM compte WHERE dpbh = @dpbh'
const selprefs = 'SELECT * FROM prefs WHERE id = @id AND v > @v'
const selcompta = 'SELECT * FROM compta WHERE id = @id AND v > @v'

function connexionCompteTr(cfg, args, result) {
  const compte = stmt(cfg, selcomptedpbh).get({ dpbh: args.dpbh })
  if (!compte || (compte.pcbh !== args.pcbh)) {
    throw new AppExc(X_SRV, '08-Compte non authentifié : aucun compte n\'est déclaré avec cette phrase secrète')
  }
  args.id = compte.id
  const prefs = stmt(cfg, selprefs).get({ id: compte.id, v: args.vprefs })
  const compta = stmt(cfg, selcompta).get({ id: compte.id, v: args.vcompta })

  result.rowCompte = compte.v > args.vcompte ? newItem('compte', compte) : null
  result.rowPrefs = prefs ? newItem('prefs', prefs) : null
  result.rowCompta = compta ? newItem('compta', compta) : null
  result.estComptable = cfg.comptables.indexOf(compte.pcbh) !== -1
}

/*********************************************/
const selavataridv = 'SELECT v FROM avatar WHERE id = @id'
const selcompteidv = 'SELECT v FROM compte WHERE id = @id'
/*****************************************
Chargement les avatars d'un compte dont la version est plus récente que celle détenue en session
Abonnemnts aux avatars
Vérifie que le compte n'a pas changé de version
args :
- sessionId
- idsVers : map de clé:id de l'avatar, valeur: version détenue en session
- idc : id du compte
- vc : version du compte
Retour
- rowItems : les avatars ayant une version plus récente
- ok : true si le compte a toujours la version vc
*/
async function chargerAv (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(chargerAvTr)(cfg, args, rowItems)
  result.rowItems = rowItems
  result.ok = args.ok
  session.plusAvatars(args.ids)
  return result
}
m1fonctions.chargerAv = chargerAv

const selavatar = 'SELECT * FROM avatar WHERE id = @id AND v > @v'

function chargerAvTr(cfg, args, rowItems) {
  const c = stmt(cfg, selcompteidv).get({ id : args.idc })
  if (!c || c.v > args.vc) { args.ok = false; return }
  args.ids = []
  for(const ids in args.idsVers) {
    const id = parseInt(ids)
    args.ids.push(id)
    const row = stmt(cfg, selavatar).get({ id, v: args.idsVers[id] })
    if (row) rowItems.push(newItem('avatar', row))
    args.ok = true
  }
}

/********************************************************
Chargement des secrets d'un avatars d'un compte
(Resp. secrets couple, secrets membres groupe)
Abonnement de l'avatar / couple / groupe
args :
- sessionId
- id : id du compte
Retour
- rowItems : contient tous les secrets de l'avatar
*/
async function chargerAS (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(chargerASTr)(cfg, args.id, rowItems)
  result.rowItems = rowItems
  session.plusAvatars([args.id])
  return result
}
m1fonctions.chargerAS = chargerAS

async function chargerCS (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(chargerCSTr)(cfg, args.id, rowItems)
  result.rowItems = rowItems
  session.plusCouples([args.id])
  return result
}
m1fonctions.chargerCS = chargerCS

async function chargerGMS (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(chargerGMSTr)(cfg, args.id, rowItems)
  result.rowItems = rowItems
  session.plusGroupes([args.id])
  return result
}
m1fonctions.chargerGMS = chargerGMS

const selmembreId = 'SELECT * FROM membre WHERE id = @id'
const selsecretId = 'SELECT * FROM secret WHERE id = @id'

function chargerASTr(cfg, id, rowItems) {
  {
    const rows = stmt(cfg, selsecretId).all({ id : id })
    rows.forEach((row) => { rowItems.push(newItem('secret', row)) })
  }
}

function chargerGMSTr(cfg, id, rowItems) {
  {
    const rows = stmt(cfg, selsecretId).all({ id : id })
    rows.forEach((row) => { rowItems.push(newItem('secret', row)) })
  }
  {
    const rows = stmt(cfg, selmembreId).all({ id : id })
    rows.forEach((row) => { rowItems.push(newItem('membre', row)) })
  }
  {
    const row = stmt(cfg, selgroupeId).get({ id : id })
    rowItems.push(newItem('groupe', row))
  }
}

function chargerCSTr(cfg, id, rowItems) {
  {
    const rows = stmt(cfg, selsecretId).all({ id : id })
    rows.forEach((row) => { rowItems.push(newItem('secret', row)) })
  }
  {
    const row = stmt(cfg, selcoupleId).get({ id : id })
    rowItems.push(newItem('couple', row))
  }
}

/********************************************************
Désabonnements : listes d'avatars, de groupes, de couples, de CVs
args :
- sessionId
- lav, lgr, lcp, lcv
Retour
- rowItems : contient tous les secrets de l'avatar
*/
async function desabonnements (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  if (args.lav && args.lav.length)  session.moinsAvatars([args.lav])
  if (args.lgr && args.lgr.length)  session.moinsGroupes([args.lr])
  if (args.lcc && args.lcc.length)  session.moinsCouples([args.lcc])
  if (args.lcv && args.lcv.length)  session.moinsCVs([args.lcv])
  return result
}
m1fonctions.desabonnements = desabonnements

/********************************************************
Chargement des groupes et couples des avatars d'un compte
Abonneents à ceux-ci
Vérifie que les avatars du compte et le compte n'ont pas changé de version
args :
- sessionId
- gridsVers, cpidsVers, avIdsVers : map de clé:id du groupe, valeur: version détenue en session
- idc : id du compte
- vc : version du compte
Retour
- rowItems : contient des groupes et des comptes 
(ceux ayant une version supérieure à celle détenue en session)
- ok : true si le compte et les avatars ont toujours la version indiquée
*/
async function chargerGrCp (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  const grIds = []
  const cpIds = []
  cfg.db.transaction(chargerGrCpTr)(cfg, args, grIds, cpIds, rowItems)
  result.rowItems = rowItems
  result.ok = args.ok
  session.plusGroupes(grIds)
  session.plusCouples(cpIds)
  return result
}
m1fonctions.chargerGrCp = chargerGrCp

const selgroupe = 'SELECT * FROM groupe WHERE id = @id AND v > @v'
const selcouple = 'SELECT * FROM couple WHERE id = @id AND v > @v'

function chargerGrCpTr(cfg, args, grIds, cpIds, rowItems) {
  const c = stmt(cfg, selcompteidv).get({ id : args.idc })
  if (!c || c.v > args.vc) { args.ok = false; return }
  const ids = []
  for (const idx in args.avidsVers) {
    const id = parseInt(idx)
    ids.push(id)
    const a = stmt(cfg, selavataridv).get({ id })
    if (!a || a.v > args.avidsVers[id]) { args.ok = false; return }  
  }
  for(const idx in args.gridsVers) {
    const id = parseInt(idx)
    ids.push(id)
    grIds.push(id)
    const row = stmt(cfg, selgroupe).get({ id, v: args.gridsVers[id] })
    if (row) rowItems.push(newItem('groupe', row))
  }
  for(const idx in args.cpidsVers) {
    const id = parseInt(idx)
    ids.push(id)
    cpIds.push(id)
    const row = stmt(cfg, selcouple).get({ id, v: args.cpidsVers[id] })
    if (row) rowItems.push(newItem('couple', row))
  }
  signatures(cfg, args.idc, ids)
  args.ok = true
}

const updddscompta = 'UPDATE compta SET dds = @dds WHERE id = @id'
const updddscv= 'UPDATE cv SET dds = @dds WHERE id = @id'
const ddscompta = 'SELECT dds FROM compta WHERE id = @id'
const ddscv = 'SELECT dds FROM cv WHERE id = @id'

function signatures (cfg, idc, lagc) {
  if (idc) {
    const a = stmt(cfg, ddscompta).get({ id: idc })
    if (a) {
      const j = new DateJour().nbj
      if (a.dds < j) stmt(cfg, updddscompta).run({ id: idc, dds:j })
    }
  }
  lagc.forEach((id) => {
    const a = stmt(cfg, ddscv).get({ id: id })
    if (a) {
      const j = ddsAvatarGroupeCouple(a.dds)
      if (a.dds < j) stmt(cfg, updddscv).run({ id: id, dds: j })
    }
  })
}

/********************************************************
Chargement des secrets d'un objet maître (avatar / groupe / couple)
dont la version est postérieure à v
args :
- sessionId
- id : id de l'objet maître
- v : version min
Retour
- rowItems : contient des rowItems de secrets
(ceux ayant une version supérieure à celle détenue en session)
*/
async function chargerSc (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  result.rowItems = rowItems
  const rows = stmt(cfg, selsecret).all({ id: args.id, v: args.v })
  rows.forEach((row) => {
    result.rowItems.push(newItem('secret', row))
  })
  return result
}
m1fonctions.chargerSc = chargerSc

/********************************************************
Chargement des membre d'un groupe
dont la version est postérieure à v
args :
- sessionId
- id : id du groupe
- v : version min
Retour
- rowItems : contient des rowItems de secrets
(ceux ayant une version supérieure à celle détenue en session)
*/
async function chargerMb (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  result.rowItems = rowItems
  const rows = stmt(cfg, selmembre).all({ id: args.id, v: args.v })
  rows.forEach((row) => {
    result.rowItems.push(newItem('membre', row))
  })
  return result
}
m1fonctions.chargerMb = chargerMb

/******************************************
Chargement des CVs changées après v
Abonnement à toutes celles de la liste
args:
- sessionId
- v : version des CV
- l1 : array des ids des CVs à retouner si postérieures à v
- l2 : array des ids des CVs à retouner si v non 0
*/
const selcvin = 'SELECT * FROM cv WHERE v > @v AND id IN ('

async function chargerCVs (cfg, args) {
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const session = checkSession(args.sessionId)
  const rowItems = []
  cfg.db.transaction(chargerCVsTr)(cfg, session, args, rowItems)
  result.rowItems = rowItems
  args.l2.forEach(id => { args.l1.push(id) })
  session.cvsIds = new Set(args.l1)
  return result
}
m1fonctions.chargerCVs = chargerCVs

function chargerCVsTr (cfg, session, args, rowItems) {
  if (args.l1.length) {
    const st = cfg.db.prepare(selcvin + args.l1.join(',') + ')')
    const rows = st.all({ v: args.v })
    for (const row of rows) rowItems.push(newItem('cv', row))
  }
  if (args.l2.length) {
    const st = cfg.db.prepare(selcvin + args.l2.join(',') + ')')
    const rows = st.all({ v: 0 })
    for (const row of rows) rowItems.push(newItem('cv', row))
  }
}

/* Creation nouvel avatar ****************************************
- sessionId, 
- clePub,
- idc: numéro du compte
- vcav: version du compte avant (ne doit pas avoir changé),
- mack: map des avatars dans le compte
- rowAvatar
Retour :
- sessionId
- dh
- statut : 0:OK, 1:retry (version compte ayant évolué)
*/
function creationAvatar (cfg, args) {
  const session = checkSession(args.sessionId)

  const result = { sessionId: args.sessionId, dh: getdhc() }
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)
  const avrsa = { id: avatar.id, clepub: args.clePub, vsh: 0 }
  const cv = { id: avatar.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(0), cv: null, vsh: 0 }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc2 = versions[j]

  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j]

  versions[0]++ // version des CVs
  cv.v = versions[0]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(creationAvatarTr)(cfg, session, args, avatar, avrsa, cv, rowItems)

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

function creationAvatarTr (cfg, session, args, avatar, avrsa, cv, rowItems) {
  const c = stmt(cfg, selcompteId).get({ id: args.idc })
  if (!c) throw new AppExc(A_SRV, '06-Compte non trouvé')
  if (c && c.v !== args.vcav) {
    args.statut = 1
    return
  }
  c.v = args.vc2
  c.mack = args.mack
  stmt(cfg, upd1compte).run(c)
  rowItems.push(newItem('compte', c))

  stmt(cfg, insavatar).run(avatar)
  rowItems.push(newItem('avatar', avatar))

  stmt(cfg, insavrsa).run(avrsa)

  stmt(cfg, inscv).run(cv)
  rowItems.push(newItem('cv', cv))
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
  const p = stmt(cfg,selprefsId).get({ id: id })
  if (!p) throw new AppExc(X_SRV, '06-Compte non trouvé')

  const x = deserial(p.mapk)
  x[code] = datak
  p.mapk = serial(x)
  p.v = v
  stmt(cfg, updprefs).run( { mapk: p.mapk, v, id })
  rowItems.push(newItem('prefs', p))
}

/***************************************
Enregistrement d'une CV (avatar / groupe / couple) :
Args : 
- sessionId
- id: de l'avatar / groupe / couple
- cv : [photo, info] sérialisé et crypté par la clé de l'avatar / groupe / couple
Retour :
- sessionId
- dh
Exception : avatar inexistant
*/
const updcv = 'UPDATE cv SET v = @v, cv = @cv WHERE id = @id'

function majCV (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(0)
  versions[j]++
  setValue(cfg, VERSIONS)
  const v = versions[j]

  const rowItems = []

  cfg.db.transaction(majCVTr)(cfg, args.id, v, args.cv, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.majCV = majCV

function majCVTr (cfg, id, v, cv, rowItems) {
  let a = stmt(cfg, selcvId).get({ id: id })
  if (a) {
    a.cv = cv
    a.v = v
    stmt(cfg, updcv).run(a)
  } else {
    a = { id, v, x: 0, dds: 0, cv, vsh:0 }
    stmt(cfg, inscv).run(a)
  }
  rowItems.push(newItem('cv', a))
}

/***************************************
MAJ d'un couple
Args : majCouple
- sessionId
- id: du couple
- avc: 0 ou 1
- ardc:
- infok
- mc:
- vmax: [v1, v2]
Retour :
- sessionId
- dh
A_SRV, '24-Couple non trouvé'
*/
const updcouple0 = 'UPDATE couple SET v = @v, ardc = @ardc, infok0 = @infok0, mc0 = @mc0, mx10 = @mx10, mx20 = @mx20 WHERE id = @id'
const updcouple1 = 'UPDATE couple SET v = @v, ardc = @ardc, infok1 = @infok1, mc1 = @mc1, mx11 = @mx11, mx21 = @mx21 WHERE id = @id'

function majCouple (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []

  cfg.db.transaction(majCoupleTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.majCouple = majCouple

function majCoupleTr (cfg, args, rowItems) {
  const cp = stmt(cfg, selcoupleId).get({ id: args.id })
  if (!cp) throw new AppExc(A_SRV, '24-Couple non trouvé')

  cp.v = args.v
  if (args.ardc) cp.ardc = args.ardc
  if (args.avc === 0) {
    if (args.vmax) { cp.mx10 = args.vmax[0]; cp.mx20 = args.vmax[1] }
    if (args.infok) cp.infok0 = args.infok
    if (args.mc) cp.mc0 = args.mc
    stmt(cfg, updcouple0).run(cp)
  } else {
    if (args.vmax) { cp.mx11 = args.vmax[0]; cp.mx21 = args.vmax[1] }
    if (args.infok) cp.infok1 = args.infok
    if (args.mc) cp.mc1 = args.mc
    stmt(cfg, updcouple1).run(cp)
  }
  rowItems.push(newItem('couple', cp))
}

/**************************************** */
const selavgrvqid = ''
const updavgrvq = ''

const selsecret = 'SELECT * FROM secret WHERE id = @id AND v > @v'
const selmembre = 'SELECT * FROM membre WHERE id = @id AND v > @v'

const updstmembre = 'UPDATE membre SET v = @v, st = @st WHERE id = @id AND im = @im'
const updstcouple = 'UPDATE couple SET v = @v, st = @st WHERE id = @id'

/* Régularisation Groupe ****************************************
Mise à jour de lgrk dans l'avatar et suppression du row invitgr
args
- id : de l'avatar
- idg: id du groupe (pour s'abonner)
- ni : numéro d'invitation du groupe à inscrire
- datak : [nom, rnd, im] du groupe à inscrire dans lgrk de l'avatar
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
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(regulGrTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.regulGr = regulGr

function regulGrTr (cfg, session, args, rowItems) {
  const a = stmt(cfg, selavatarId).get({ id: args.id })
  if (!a) return // avatar supprimé depuis (?)
  let map = a.lgrk ? deserial(a.lgrk) : {}
  if (!map) map = {}
  if (map[args.ni]) return // déjà fait
  map[args.ni] = args.datak
  a.v = args.v
  a.lgrk = serial(map)
  stmt(cfg, upd1avatar).run(a)
  rowItems.push(newItem('avatar', a))
  stmt(cfg, delinvitgr).run({ id: args.id, ni: args.ni })
  session.plusGroupes([args.idg])
}

/* Suppression d'accès à un groupe pour un avatar ****************************************
Suppression de l'entrée de lgrk d'un avatar correspondant à un groupe
- (1) détecté zombi par une session (expiration d'une période post fin d'hébergement)
- (2) auto-exclusion d'un groupe par un avatar
Fin d'abonnement au groupe SUR OPTION. Dans le cas (2), un autre avatar du compte
peut encore être membre actif du groupe.
args
- sessionId
- id: id de l'avatar
- ni: numéro d'invitation
*/

async function supprAccesGrAv (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(supprAccesGrAvTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.supprAccesGrAv = supprAccesGrAv

function supprAccesGrAvTr (cfg, args, rowItems) {
  const a = stmt(cfg, selavatarId).get({ id: args.id })
  if (!a || !a.lgrk) return // avatar supprimé depuis (?)
  const map = deserial(a.lgrk)
  delete map[args.ni]
  a.v = args.v
  a.lgrk = serial(map)
  stmt(cfg, upd1avatar).run(a)
  rowItems.push(newItem('avatar', a))
}

/* Changement de statut d'un membre pour tenir compte de la disparition de son avatar ************
args:
- sessionId
- id, im : id du membre
retour
- sessionId, dh
*/

async function membreDisparu (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  args.v = {}
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(membreDisparuTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.membreDisparu = membreDisparu

function membreDisparuTr (cfg, args, rowItems) {
  const m = stmt(cfg, selmembreIdIm).get({ id: args.id, im:args.im })
  if (!m) return
  const stx = Math.floor(m.st / 10)
  const stp = m.st % 10
  if (stx === 5) return
  m.st = 50 + stp
  m.v = args.v
  stmt(cfg, updstmembre).run(m)
  rowItems.push(newItem('membre', m))
}

/* Changement de statut d'un couple pour tenir compte de la disparition d'un de ses avatars ************
args:
- sessionId
- id : id du couple
- idx : index du conjoint disparu (0 ou 1)
retour
- sessionId, dh
*/
async function coupleDisparu (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  args.v = {}
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(coupleDisparuTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.coupleDisparu = coupleDisparu

function coupleDisparuTr (cfg, args, rowItems) {
  const c = stmt(cfg, selcoupleId).get({ id: args.id, im:args.im })
  if (!c) return
  const st01 = c.st % 100
  let st0 = Math.floor(st01 / 10)
  let st1 = st01 % 10
  if (args.idx) st1 = 0; else st0 = 0
  const nst = 5000 + (st0 * 10) + st1
  if (nst === c.st) return
  c.st = nst
  c.v = args.v
  stmt(cfg, updstcouple).run(c)
  rowItems.push(newItem('couple', c))
}

/*****************************************
Chargement des invitGr des avatars d'un compte
- sessionId, ids (array des ids des avatars)
*/

async function chargerInvitGr (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc(), rowItems: [] }
  for (let i = 0; i < args.ids.length; i++) {
    const rows = stmt(cfg, selinvitgrId).all({ id: args.ids[i] })
    rows.forEach((row) => {
      result.rowItems.push(newItem('invitgr', row))
    })
  }
  return result
}
m1fonctions.chargerInvitGr = chargerInvitGr

/*****************************************
!!GET!! getcv : retourne la CV d'un avatar
args : 
-sessionId
-sid de l'avatar
*/
const bytes0 = new Uint8Array(0)

async function getcv (cfg, args) {
  checkSession(args.sessionId)
  try {
    const c = stmt(cfg, selcvId).get({ id: crypt.sidToId(args.sid) })
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
!!GET!! getclepub : retourne la clé publique d'un avatar
args : 
-sessionId
-sid de l'avatar
*/
const selavrsapub = 'SELECT clepub FROM avrsa WHERE id = @id'

async function getclepub (cfg, args) {
  checkSession(args.sessionId)
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
- ts, id, ns, mc, txts, v1, xp, st, varg, mcg, im, refs
- varg : {id (du secret), ts, idc, idc2, dv1, dv2, im}
 Retour :
- sessionId
- dh
- info : array des lignes d'information
Exception : dépassement des quotas 
*/

async function nouveauSecret (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  volumes (cfg, args.varg)

  let mc
  if (args.ts > 0) {
    const x = { }
    if (args.ts === 2) x[0] = args.mcg
    x[args.im] = args.mc
    mc = serial(x)
  } else {
    mc = args.mc
  }

  const secret = { 
    id: args.id,
    ns: args.ns,
    v: args.varg.vs,
    x: 0,
    st: args.st,
    xp: args.xp,
    v1: args.v1,
    v2: 0,
    mc: mc,
    txts: args.txts,
    mfas: null,
    refs: args.refs || null,
    vsh: 0
  }

  const rowItems = []
  cfg.db.transaction(nouveauSecretTr)(cfg, args, secret, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh, info: args.info }
}
m1fonctions.nouveauSecret = nouveauSecret

function nouveauSecretTr (cfg, args, secret, rowItems) {
  args.varg.dv1 = secret.v1
  args.varg.dv2 = 0
  args.info = volumesTr (cfg, args.varg, rowItems)
  stmt(cfg, inssecret).run(secret)
  rowItems.push(newItem('secret', secret))
}

/***************************************
MAJ secret
Args : 
- sessionId
- ts, id, ns, mc, txts, v1, xp, st, varg, mcg, im, refs
temp : null: inchangé, 99999: devient permanent, 780: (re)devient temporaire
xp : null: inchangé
txts: null: inchangé (donc v1 inchangé)
mcg: null: inchangé (im sert à mettre à jour les motsclés)

Retour :
- sessionId
- dh
- info
Exceptions
*/
const upd1secret = 'UPDATE secret SET v = @v, st = @st, xp = @xp, v1 = @v1, txts = @txts, mc = @mc WHERE id = @id AND ns = @ns'

async function maj1Secret (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  volumes (cfg, args.varg)
  const rowItems = []

  cfg.db.transaction(maj1SecretTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh, info: args.info }
}
m1fonctions.maj1Secret = maj1Secret

function maj1SecretTr (cfg, args, rowItems) {

  const secret = stmt(cfg, selsecretIdNs).get({ id: args.id, ns: args.ns }) 
  if (!secret) throw new AppExc(A_SRV, '13-Secret inexistant')
  args.varg.dv1 = args.txts ? args.v1 - secret.v1 : 0
  args.info = volumesTr (cfg, args.varg, rowItems)

  secret.v = args.varg.vs
  if (args.txts !== null) {
    secret.v1 = args.v1
    secret.txts = args.txts
  }
  if (args.xp !== null) secret.xp = args.xp
  if (args.st !== null) secret.st = args.st
  if (args.ts > 0) {
    const x = secret.mc
    if (args.ts === 2 && args.mcg !== null) x[0] = args.mcg
    if (args.mc !== null) x[args.im] = args.mc
    secret.mc = serial(x)
  } else if (args.mc !== null) {
    secret.mc = args.mc
  }
  stmt(cfg, upd1secret).run(secret)
  rowItems.push(newItem('secret', secret))
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

  const secret = stmt(cfg, selsecretIdNs).get({ id: args.id, ns: args.ns })
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

  const secret = stmt(cfg, selsecretIdNs).get({ id: args.id, ns: args.ns }) 
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
    secret2 = stmt(cfg, selsecretIdNs).get({ id: args.id2, ns: args.ns2 }) 
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
Parrainage : args de m1/nouveauParrainage
  - sessionId: data.sessionId,
  - rowCouple
  - rowContact
  - id: id de l'avatar
  - ni: clé d'accès à lcck de l'avatar
  - datak : clé cc cryptée par la clé k
  Retour : dh
  X_SRV, '14-Cette phrase de parrainage est trop proche d\'une déjà enregistrée'
  X_SRV, '23-Avatar non trouvé.'
*/
// eslint-disable-next-line no-unused-vars
const updcontact = 'UPDATE contact SET dlv = @dlv WHERE pph = @pph'
const upd2avatar = 'UPDATE avatar SET v = @v, lcck = @lcck WHERE id = @id'

async function nouveauParrainage (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const contact = deserial(args.rowContact)
  const couple = deserial(args.rowCouple)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(couple.id)
  versions[j]++
  couple.v = versions[j] // version du row couple

  j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version du row avatar

  const cv = { id: couple.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(0), cv: null, vsh: 0 }
  j = idx(0)
  versions[j]++
  cv.v = versions[j] // version de la cv du groupe

  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(nouveauParrainageTr)(cfg, args, contact, couple, cv, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems })
  setImmediate(() => { processQueue() })
  session.plusCouples([couple.id])
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.nouveauParrainage = nouveauParrainage

function nouveauParrainageTr (cfg, args, contact, couple, cv, rowItems) {
  const p = stmt(cfg, selcontactPhch).get({ phch: contact.phch })
  if (p) throw new AppExc(X_SRV, '14-Cette phrase de parrainage est trop proche d\'une déjà enregistrée.')
  stmt(cfg, inscontact).run(contact)
  stmt(cfg, inscouple).run(couple)
  rowItems.push(newItem('couple', couple))

  const a = stmt(cfg, selavatarId).get({ id: args.id })
  if (!a) throw new AppExc(X_SRV, '23-Avatar non trouvé.')
  const map = a.lcck ? deserial(a.lcck) : {}
  if (map[args.ni]) return // déjà fait
  map[args.ni] = args.datak
  a.v = args.v
  a.lcck = serial(map)
  stmt(cfg, upd2avatar).run(a)
  rowItems.push(newItem('avatar', a))

  stmt(cfg, inscv).run(cv)
  rowItems.push(newItem('cv', cv))
}

/******************************************************************
Acceptation
    sessionId: data.sessionId,
    clePubAv: kpav.publicKey, // clé publique de l'avatar créé
    rowCompte, // compte créé
    rowCompta, // compta du compte créé
    rowAvatar, // premier avatar du compte créé
    rowPrefs, // préférences du compte créé
    idCouple: couple.id, // id du couple
    phch: arg.phch, // hash de la phrase de contact
    idcp, // id du compte parrain
    idavp: couple.idE, // id de l'avatar parrain
    dr1: arg.estPar ? d.r1 + d.f1 : d.f1, // montant à réduire de sa réserve
    dr2: arg.estPar ? d.r2 + d.f2 : d.f2,
    mc0: arg.estPar ? MC.FILLEUL : MC.INTRODUIT, // mot clé à ajouter dans le couple
    mc1: arg.estPar ? MC.PARRAIN : MC.INTRODUCTEUR,
    ardc // ardoise du couple
Refus
    sessionId: data.sessionId,
    phch: arg.phch, // hash de la phrase de contact
    idCouple: couple.id, // id du couple
    ardc // ardoise du couple
Retour : sessionId, dh, si ok : rowItems : compte, compta, prefs, avatar, contactf
*/

const delcontact = 'DELETE FROM contact WHERE phch = @phch'
const updcompta = 'UPDATE compta SET v = @v, data = @data WHERE id = @id'
const upd2couple = 'UPDATE couple SET v = @v, st = @st, dlv = 0, ardc = @ardc, mc0 = @mc0, mc1 = @mc1 WHERE id = @id'
const updv1v2couple = 'UPDATE couple SET v = @v, v1 = @v1, v2 = @v2 WHERE id = @id'
const updv1v2groupe = 'UPDATE groupe SET v = @v, v1 = @v1, v2 = @v2 WHERE id = @id'

async function acceptParrainage (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const compte = schemas.deserialize('rowcompte', args.rowCompte)
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)
  const compta = schemas.deserialize('rowcompta', args.rowCompta)
  const prefs = schemas.deserialize('rowprefs', args.rowPrefs)
  const cv = { id: avatar.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(0), cv: null, vsh: 0 }

  const versions = getValue(cfg, VERSIONS)

  let j = idx(args.idcp)
  versions[j]++
  args.vcp = versions[j] // version de compta parrain (L'AUTRE)

  j = idx(compte.id)
  versions[j]++
  compte.v = versions[j] // version du compte filleul (MOI)
  compta.v = versions[j] // version de compta filleul (MOI)
  prefs.v = versions[j] // version de prefs filleul (MOI)

  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j] // version de l'avatar filleul (MOI)

  j = idx(args.idCouple)
  versions[j]++
  args.vcouple = versions[j] // version de l'avatar filleul (MOI)

  j = idx(0)
  versions[j]++
  cv.v = versions[j] // version de la carte de visite

  setValue(cfg, VERSIONS)

  const items = {} // contiendra après l'appel : comptaP (du parrain), couple

  cfg.db.transaction(acceptParrainageTr)(cfg, session, args, compte, compta, prefs, avatar, cv, items)

  const i1 = newItem('compte', compte)
  const i2 = newItem('avatar', avatar)
  const i3 = newItem('prefs', prefs)
  const i4 = newItem('compta', compta)
  const i5 = newItem('couple', items.couple)
  const i6 = newItem('compta', items.comptaP)

  result.rowItems = [i1, i2, i3, i4, i5] // à retourner en résultat
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: [i1, i2, i3, i4, i5, i6] }) // à synchroniser
  setImmediate(() => { processQueue() })

  // Abonnements du nouveau compte
  session.compteId = compte.id
  session.plusAvatars([avatar.id])
  session.plusCouples([args.idCouple])
  session.plusCvs([args.idavp])
  return result
}
m1fonctions.acceptParrainage = acceptParrainage
  
function acceptParrainageTr (cfg, session, args, compte, compta, prefs, avatar, cv, items) {
  const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
  if (c) {
    if (c.pcbh === compte.pcbh) {
      throw new AppExc(X_SRV, '03-Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(X_SRV, '04-Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
    }
  }

  stmt(cfg, delcontact).run({ phch: args.phch }) // suppression du contact

  const comptaP = stmt(cfg, selcomptaId).get({ id: args.idcp })
  if (!comptaP) {
    throw new AppExc(A_SRV, '17-Compte parrain : données de comptabilité absentes')
  }
  const compteurs = new Compteurs(comptaP.data)
  const ok = compteurs.setRes([-args.dr1, -args.dr2])
  if (!ok) throw new AppExc(X_SRV, '18-Réserves de volume insuffisantes du parrain pour les forfaits attribués compte')
  comptaP.v = args.vcp
  comptaP.data = compteurs.calculauj().serial
  stmt(cfg, updcompta).run(comptaP)
  items.comptaP = comptaP

  // Insertion des nouveaux compte, avatar, prefs du filleul
  stmt(cfg, inscompte).run(compte)

  compta.dds = new DateJour().nbj
  stmt(cfg, inscompta).run(compta)

  stmt(cfg, insprefs).run(prefs)

  stmt(cfg, insavatar).run(avatar)

  stmt(cfg, inscv).run(cv)

  // Clé RSA du filleul
  const avrsaAv = { id: avatar.id, clepub: args.clePubAv, vsh: 0 }
  stmt(cfg, insavrsa).run(avrsaAv)

  // MAJ du couple
  const cp = stmt(cfg, selcoupleId).get({ id: args.idCouple })
  if (!cp) throw new AppExc(A_SRV, '24-Couple non trouvé')
  cp.v = args.vcouple
  cp.st = 3011 // Phase en couple, les deux actifs
  cp.mc1 = new Uint8Array(args.mc1)
  const s = cp.mc0 ? new Set(cp.mc0) : new Set()
  args.mc0.forEach(m => { s.add(m) })
  cp.mc0 = new Uint8Array(Array.from(s))
  cp.ardc = args.ardc
  stmt(cfg, upd2couple).run(cp)
  items.couple = cp
}

const upd2parrain = 'UPDATE parrain SET v = @v,  datax = null, datak = null, data2k = null WHERE pph = @pph'
const upd3parrain = 'UPDATE parrain SET v = @v, dlv = @dlv WHERE pph = @pph'
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

  const parrain = stmt(cfg, selcontactPhch).get({ phch: args.phch })
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
  
function refusParrainageTr (/* cfg, parrain */) {
  // stmt(cfg, upd1parrain).run(parrain)
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

  const parrain = stmt(cfg, selcontactPhch).get({ phch: args.phch })
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

/* row contact depuis la phrase de contact */
async function getContact (cfg, args) {
  try {
    const c = stmt(cfg, selcontactPhch).get({ phch: parseInt(args.phch) })
    if (!c) return { bytes0 }
    const b = serial(c)
    return { bytes: b }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
m1fonctions.getContact = getContact

/* row contact depuis la phrase de contact */
async function getCouple (cfg, args) {
  try {
    const c = stmt(cfg, selcoupleId).get({ id : parseInt(args.id) })
    if (!c) return { bytes0 }
    const b = serial(c)
    return { bytes: b }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
m1fonctions.getCouple = getCouple

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
  membre.v = versions[j]

  j = idx(args.ida)
  versions[j]++
  args.v = versions[j] // version de l'avatar

  const cv = { id: groupe.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(0), cv: null, vsh: 0 }
  j = idx(0)
  versions[j]++
  cv.v = versions[j] // version de la cv du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(creationGroupeTr)(cfg, session, args, groupe, membre, cv, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.creationGroupe = creationGroupe

function creationGroupeTr (cfg, session, args, groupe, membre, cv, rowItems) {
  const a = stmt(cfg, selavatarId).get({ id: args.ida })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  const map = a.lgrk ? deserial(a.lgrk) : {}
  if (!map[args.ni]) {
    map[args.ni] = args.datak
    a.v = args.v
    a.lgrk = serial(map)
    stmt(cfg, upd1avatar).run(a)
    rowItems.push(newItem('avatar', a))
  }

  stmt(cfg, insgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))

  stmt(cfg, inscv).run(cv)
  rowItems.push(newItem('cv', cv))

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
  const compta = stmt(cfg, selcomptaId).get({ id: args.idc })
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
  const compta = stmt(cfg, selcomptaId).get({ id: args.idc })
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
A_SRV, '18-Groupe non trouvé'
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

/* Contact d'un groupe ****************************************
args :
- sessionId
- mxim
- rowMembre
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
*/
const updmximgroupe = 'UPDATE groupe SET mxim = @mxim WHERE id = @id'

async function contactGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const membre = deserial(args.rowMembre)

  const versions = getValue(cfg, VERSIONS)
  const j = idx(membre.id)
  versions[j]++
  args.vg = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  args.statut = 0
  cfg.db.transaction(contactGroupeTr)(cfg, args, membre, rowItems)
  if (args.statut === 1) {
    result.statut = 1
    return result
  }
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.statut = 0
  return result
}
m1fonctions.contactGroupe = contactGroupe

function contactGroupeTr (cfg, args, membre, rowItems) {
  const groupe = stmt(cfg, selgroupeId).get({ id: membre.id })
  if (!groupe) throw new AppExc(A_SRV, '18-Groupe non trouvé')
  if (groupe.mxim + 1 !== args.mxim) {
    args.statut = 1
    return
  }

  groupe.v = args.vg
  groupe.mxim = args.mxim
  stmt(cfg, updmximgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))
  
  membre.v = args.vg
  stmt(cfg, insmembre).run(membre)
  rowItems.push(newItem('membre', membre))
}

/* Inviter un contact d'un groupe ****************************************
args :
- sessionId
- rowInvitgr
- id, im : id du membre
- st : statut du membre
Retour: sessionId, dh
A_SRV, '19-Membre non trouvé
*/

async function inviterGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const invitgr = deserial(args.rowInvitgr)

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.vg = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(inviterGroupeTr)(cfg, args, invitgr, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.inviterGroupe = inviterGroupe

function inviterGroupeTr (cfg, args, invitgr, rowItems) {
  const membre = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!membre) throw new AppExc(A_SRV, '19-Membre non trouvé')
  
  membre.v = args.vg
  membre.st = args.st
  stmt(cfg, updstmembre).run(membre)
  rowItems.push(newItem('membre', membre))

  stmt(cfg, insinvitgr).run(invitgr)
  rowItems.push(newItem('invitgr', invitgr))
}

/* Accepter une invitation à un groupe ****************************************
args :
- sessionId
- id, im : id du membre
Retour: sessionId, dh
A_SRV, '19-Membre non trouvé
*/

async function acceptInvitGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.vg = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(acceptInvitGroupeTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.acceptInvitGroupe = acceptInvitGroupe

function acceptInvitGroupeTr (cfg, args, rowItems) {
  const membre = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!membre) throw new AppExc(A_SRV, '19-Membre non trouvé')
  
  membre.v = args.vg
  const p = membre.st % 10
  membre.st = 20 + p
  stmt(cfg, updstmembre).run(membre)
  rowItems.push(newItem('membre', membre))
}

/* Refuser une invitation à un groupe ****************************************
args :
- sessionId
- id, im : id du membre
- ida: id de l'avatar
- ni: numéro d'invitation au groupe
Retour: sessionId, dh
A_SRV, '19-Membre non trouvé
*/

async function refusInvitGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.id)
  versions[j]++
  args.vg = versions[j]
  j = idx(args.ida)
  versions[j]++
  args.va = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(refusInvitGroupeTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.refusInvitGroupe = refusInvitGroupe

function refusInvitGroupeTr (cfg, args, rowItems) {
  const membre = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!membre) throw new AppExc(A_SRV, '19-Membre non trouvé')
  const a = stmt(cfg, selavatarId).get({ id: args.ida })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  
  membre.v = args.vg
  membre.st = 0
  stmt(cfg, updstmembre).run(membre)
  rowItems.push(newItem('membre', membre))

  const map = a.lgrk ? deserial(a.lgrk) : {}
  if (!map || !map[args.ni]) return // déjà fait
  delete map[args.ni]
  a.v = args.va
  a.lgrk = serial(map)
  stmt(cfg, upd1avatar).run(a)
  rowItems.push(newItem('avatar', a))
}

/* Put URL ****************************************
args :
- sessionId
- volarg : contrôle de volume
Retour: sessionId, dh
- idf : identifiant alloué du fichier
- url : url à passer sur le PUT de son contenu
Exceptions : volume en excédent
*/

async function putUrl (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  volumes(cfg, args.volarg)
  const idf = crypt.rnd6()
  cfg.db.transaction(putUrlTr)(cfg, args, idf)
  result.idf = idf
  result.putUrl = await cfg.storage.putUrl(cfg.code, args.volarg.id, idf)
  return result
}
m1fonctions.putUrl = putUrl

function putUrlTr (cfg, args, idf) {
  volumesTr(cfg, args.volarg, null, true)
  const trec = { id: args.volarg.id, idf, dlv: new DateJour().nbj }
  stmt(cfg, instrec).run(trec)
}

/* validerUpload ****************************************
args :
- sessionId
- id, ns : du secret
- volarg : contrôle de volume
- idf : identifiant du fichier
- emap : entrée (de clé idf) de la map des fichiers attachés [lg, data]
Retour: sessionId, dh
Exceptions :
- A_SRV, '25-Secret non trouvé'
- volume en excédent
*/
const updmfassecret = 'UPDATE secret SET v = @v, v2 = @v2, mfas = @mfas WHERE id = @id AND ns = @ns'

async function validerUpload (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  volumes(cfg, args.volarg)
  const rowItems = []
  cfg.db.transaction(validerUploadTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.validerUpload = validerUpload

function validerUploadTr (cfg, args, rowItems) {
  const secret = stmt(cfg, selsecretIdNs).get({ id: args.id, ns: args.ns })
  if (!secret) throw new AppExc(A_SRV, '25-Secret non trouvé')
  const lg = args.emap[0]
  args.volarg.dv2 = lg
  args.volarg.vt = lg
  volumesTr(cfg, args.volarg, rowItems)
  secret.v = args.volarg.vs
  const map = secret.mfas ? deserial(secret.mfas) : {}
  map[args.idf] = args.emap
  secret.mfas = serial(map)
  secret.v2 = secret.v2 + lg
  let v = 0; for (const idf in map) v += map[idf][0]
  if (v !== secret.v2) {
    console.log(`Discordance volume v2 : ${args.id} / ${args.ns} : idf: ${args.idf}. v2=${secret.v2} total-v-fichiers: ${v}`)
  }
  stmt(cfg, updmfassecret).run(secret)
  rowItems.push(newItem('secret', secret))

  const trec = { id: args.id, idf: args.idf }
  stmt(cfg, deltrecIdIdf).run(trec)
}

/* supprFichier ****************************************
args :
- sessionId
- id, ns : du secret
- volarg : contrôle de volume
- idf : identifiant du fichier
Retour: sessionId, dh, info
Exceptions :
- A_SRV, '25-Secret non trouvé'
*/

async function supprFichier (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  volumes(cfg, args.volarg)
  const rowItems = []
  cfg.db.transaction(supprFichierTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.info = args.info
  return result
}
m1fonctions.supprFichier = supprFichier

function supprFichierTr (cfg, args, rowItems) {
  const secret = stmt(cfg, selsecretIdNs).get({ id: args.id, ns: args.ns })
  if (!secret) throw new AppExc(A_SRV, '25-Secret non trouvé')
  const map = secret.mfas ? deserial(secret.mfas) : {}
  const e = map[args.idf]
  if (!e) return // déjà supprimé !
  const x = deserial(e)
  const dv2 = - x[0]
  args.volarg.dv2 = dv2
  secret.v2 += dv2
  delete map[args.idf]
  let v = 0; for (const idf in map) v += map[idf][0]
  if (v !== secret.v2) {
    console.log(`Discordance volume v2 : ${args.id} / ${args.ns} : idf: ${args.idf}. v2=${secret.v2} total-v-fichiers: ${v}`)
  }
  args.info = volumesTr(cfg, args.volarg, rowItems)
  secret.v = args.volarg.vs
  secret.mfas = serial(map)
  stmt(cfg, updmfassecret).run(secret)
  rowItems.push(newItem('secret', secret))
}

/*****************************************
!!GET!! getUrl : retourne l'URL de get d'un fichier
args : 
- sessionId
- id : id du secret
- idf : id du fichier
- idc : id du compte demandeur
- vt : volume du fichier (pour compta des volumes v2 transférés)
*/
async function getUrl (cfg, args) {
  try {
    checkSession(args.sessionId)
    const dh = getdhc()
    const a = {
      id: parseInt(args.id),
      ts: parseInt(args.ts),
      dv1: 0,
      dv2: 0,
      vt: parseInt(args.vt),
      idc2: null,
      im: 0,
      idc: parseInt(args.idc),
      idf: parseInt(args.idf)
    }
    volumes(cfg, a)
    const rowItems = []
    cfg.db.transaction(volumesTr)(cfg, a, rowItems)
    syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
    setImmediate(() => { processQueue() })    
    const url = await cfg.storage.getUrl(cfg.code, a.id, a.idf)
    return { type: 'text/plain', bytes: url }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
m1fonctions.getUrl = getUrl

/* Contrôle des dépassements de volume:
- sur couple
- sur groupe
Imputation aux compte(s) et respects des forfaits,
- compte personnel, comptes d'un couple, compte hébergeur d'un groupe
args :
- id : du secret
- ts : 0 (personnel), 1 (couple), 2 (groupe)
- idc : identifiant du compte sur qui imputer: perso, perso-1, hébergeur
- idc2 : identifiant du second compte pour un secret de couple. Est null si le couple est solo.
  Le "premier" compte est celui de l'auteur du secret.
- dv1 : delta de volume v1. Si > 0 c'est une augmentation de volume
- dv2 : delta de volume v2.
- im : auteur dans le secret de couple : 0 ou 1
Retour : liste de diagnostics pour information.
  - il y a "information" lorsqu'un volume maximal / ou un forfait est dépassé
    alors que le delta est négatif ou nul, c'est à dire en cas de réduction de volume.
    la transaction est acceptée.
  - il y a "exception" quand le delta est positif et que sont dépassés l'un des seuils précédents:
  X_SRV, '51-Forfait du compte personnel dépassé pour le volume V1'
*/
const ervol = {
  c51: '51-Forfait du compte personnel dépassé pour le volume V1',
  c52: '52-Forfait du compte personnel dépassé pour le volume V2',
  c53: '53-Forfait du compte du conjoint dépassé pour le volume V1',
  c54: '54-Forfait du compte du conjoint dépassé pour le volume V2',
  c55: '55-Forfait du compte hébergeur du groupe dépassé pour le volume V1',
  c56: '56-Forfait du compte hébergeur du groupe dépassé pour le volume V2',
  c61: '61-Maximum de volume V1 du couple dépassé (attribué par l\'auteur du secret)',
  c62: '62-Maximum de volume V2 du couple dépassé (attribué par l\'auteur du secret)',
  c63: '63-Maximum de volume V1 du couple dépassé (attribué par le conjoint dans le couple de l\'auteur du secret)',
  c64: '64-Maximum de volume V2 du couple dépassé (attribué par le conjoint dans le couple de l\'auteur du secret)',
  c65: '65-Maximum de volume V1 du groupe dépassé (attribué par le compte hébergeur du groupe)',
  c66: '66-Maximum de volume V2 du couple dépassé (attribué par le compte hébergeur du groupe)'
}

export function volumes (cfg, args) {
  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc = versions[j]
  if (args.idc2) {
    j = idx(args.idc2)
    versions[j]++
    args.vc2 = versions[j]
  }
  j = idx(args.id) // version du secret / couple / groupe
  versions[j]++
  args.vs = versions[j]
  setValue(cfg, VERSIONS)
}

export function volumesTr (cfg, args, rowItems, simul) {
  // simul : si true n'enregistre PAS les volumes mais les exceptions sont levées comme si
  const c = stmt(cfg, selcomptaId).get({ id: args.idc })
  if (!c) throw new AppExc(A_SRV, '40-Comptabilité du compte principal non trouvée')
  const c2 = args.idc2 ? args.stmt(cfg, selcomptaId).get({ id: args.idc2 }) : null
  if (args.idc2 && !c2) throw new AppExc(A_SRV, '41-Comptabilité du compte secondaire non trouvée')
  const cp = args.ts === 1 ? args.stmt(cfg, selcoupleId).get({ id: args.id }) : null
  if (args.ts === 1 && !cp) throw new AppExc(A_SRV, '42-Couple non trouvée')
  const gr = args.ts === 2 ? args.stmt(cfg, selgroupeId).get({ id: args.id }) : null
  if (args.ts === 2 && !gr) throw new AppExc(A_SRV, '43-Groupe non trouvée')

  const info = []

  function f1 (c, c51, c52, simul) {
    const compteurs = new Compteurs(c.data)
    let ok = compteurs.setV1(args.dv1)
    if (!ok) {
      const m = ervol[c51] + ` [demande: ${compteurs.v1 + args.dv1} / forfait: ${compteurs.f1 * UNITEV1}]`
      if (args.dv1 > 0) throw new AppExc(X_SRV, m); else info.push(m)
    }
    ok = compteurs.setV2(args.dv2)
    if (!ok) {
      const m = ervol[c52] + ` [demande: ${compteurs.v2 + args.dv2} / forfait: ${compteurs.f2 * UNITEV2}]`
      if (args.dv2 > 0) throw new AppExc(X_SRV, m); else info.push(m)
    }
    if (simul) return
    c.v = args.vc
    if (args.vt) compteurs.setTr(args.vt) // volume transféré
    c.data = compteurs.calculauj().serial
    stmt(cfg, updcompta).run(c)
    rowItems.push(newItem('compta', c))
  }

  function f2 (simul) {
    {
      const dm = cp.v1 + args.dv1
      let mx = (args.im ? cp.mx11 : cp.mx10) * UNITEV1
      if (dm > mx) {
        const m = ervol.c61 + ` [demande: ${dm} / forfait: ${mx}]`
        if (args.dv1 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
      }
      if (args.idc2) { // le couple peut être un solo
        mx = (args.im ? cp.mx10 : cp.mx11) * UNITEV1
        if (dm > mx) {
          const m = ervol.c63 + ` [demande: ${dm} / forfait: ${mx}]`
          if (args.dv1 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
        }
      }
    }
    {
      const dm = cp.v2 + args.dv2
      let mx = (args.im ? cp.mx21 : cp.mx20) * UNITEV2
      if (dm > mx) {
        const m = ervol.c62 + ` [demande: ${dm} / forfait: ${mx}]`
        if (args.dv2 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
      }
      if (args.idc2) { // le couple peut être un solo
        mx = (args.im ? cp.mx20 : cp.mx21) * UNITEV1
        if (dm > mx) {
          const m = ervol.c64 + ` [demande: ${dm} / forfait: ${mx}]`
          if (args.dv2 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
        }
      }
    }
    if (simul) return
    cp.v = args.vs
    cp.v1 = cp.v1 + args.dv1
    cp.v2 = cp.v2 + args.dv2
    stmt(cfg, updv1v2couple).run(cp)
    rowItems.push(newItem('couple', cp))
  }

  function f3(simul) {
    {
      const dm = gr.v1 + args.dv1
      const mx = gr.f1 * UNITEV1
      if (dm > mx) {
        const m = ervol.c65 + ` [demande: ${dm} / forfait: ${mx}]`
        if (args.dv1 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
      }
    }
    {
      const dm = gr.v2 + args.dv1
      const mx = gr.f2 * UNITEV2
      if (dm > mx) {
        const m = ervol.c66 + ` [demande: ${dm} / forfait: ${mx}]`
        if (args.dv2 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
      }
    }
    if (simul) return
    gr.v = args.vs
    gr.v1 = gr.v1 + args.dv1
    gr.v2 = gr.v2 + args.dv2
    stmt(cfg, updv1v2groupe).run(gr)
    rowItems.push(newItem('groupe', gr))
  }

  if (args.ts === 0) { // perso
    f1(c, 'c51', 'c52', simul) // compta
  } else if (args.ts === 1) { // couple
    f1(c, 'c51', 'c52', simul) // compta
    if (args.c2) { // on n'impute pas vt au compte 2
      const svvt = args.vt; args.vt = 0
      f1(c2, 'c53', 'c54', simul) // compta 2
      args.vt = svvt
    }
    f2(simul) // couple
  } else { // groupe
    f1(c, 'c55', 'c56', simul) // compta hébergeur
    f3(simul) // groupe
  }
  if (!simul) return info
}
