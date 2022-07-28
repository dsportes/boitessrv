import { crypt } from './crypto.mjs'
import { getdhc, sleep } from './util.mjs'
import { getSession, syncListQueue, processQueue } from './session.mjs'
import { AppExc, X_SRV, E_WS, A_SRV, DateJour, Compteurs, UNITEV1, UNITEV2, IDCOMPTABLE } from './api.mjs'
import { schemas, deserial, serial } from './schemas.mjs'

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
Si la dds actuelle de l'avatar ou du groupe ou du contact n'a pas plus de 14 jours, elle convient encore.
Sinon il faut en réattribuer une qui ait entre 0 et 14 d'âge.
*/
function ddsAvatarGroupeCouple () {
  const j = new DateJour().nbj
  return j - Math.floor(Math.random() * 14)
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
// eslint-disable-next-line no-unused-vars
const instribu = 'INSERT INTO tribu (id, v, nbc, f1, f2, r1, r2, datak, mncpt, datat, vsh) '
  + 'VALUES (@id, @v, @nbc, @f1, @f2, @r1, @r2, @datak, @mncpt, @datat, @vsh)'
// eslint-disable-next-line no-unused-vars
const inschat = 'INSERT INTO chat (id, v, dhde, lua, luc, st, nrc, ck, items, vsh) '
  + 'VALUES (@id, @v, @dhde, @lua, @luc, @st, @nrc, @ck, @items, @vsh)'
// eslint-disable-next-line no-unused-vars
const insgcvol = 'INSERT INTO gcvol (id, idt, f1, f2, vsh) '
  + 'VALUES (@id, @idt, @f1, @f2, @vsh)'
const instrec = 'INSERT INTO trec (id, idf, dlv) '
  + 'VALUES (@id, @idf, @dlv)'
const inscompte = 'INSERT INTO compte (id, v, dpbh, pcbh, kx, stp, nctk, nctpc, chkt, mack, vsh) '
  + 'VALUES (@id, @v, @dpbh, @pcbh, @kx, @stp, @nctk, @nctpc, @chkt, @mack, @vsh)'
const insprefs = 'INSERT INTO prefs (id, v, mapk, vsh) '
  + 'VALUES (@id, @v, @mapk, @vsh)'
const insavrsa = 'INSERT INTO avrsa (id, clepub, vsh) '
  + 'VALUES (@id, @clepub, @vsh)'
const inscv = 'INSERT INTO cv (id, v, x, dds, cv, vsh) '
  + 'VALUES (@id, @v, @x, @dds, @cv, @vsh)'
const insavatar = 'INSERT INTO avatar (id, v, lgrk, lcck, vsh) '
  + 'VALUES (@id, @v, @lgrk, @lcck, @vsh)'
const inscompta = 'INSERT INTO compta (id, t, v, st, txtt, dh, data, vsh) '
  + 'VALUES (@id, @t, @v, @st, @txtt, @dh, @data, @vsh)'
const inscouple = 'INSERT INTO couple (id, v, st, v1, v2, mx10, mx20, mx11, mx21, dlv, datac, phk0, infok0, infok1, mc0, mc1, ardc, vsh) '
  + 'VALUES (@id, @v, @st, @v1, @v2, @mx10, @mx20, @mx11, @mx21, @dlv, @datac, @phk0, @infok0, @infok1, @mc0, @mc1, @ardc, @vsh)'
const inscontact = 'INSERT INTO contact (phch, dlv, datax, vsh) '
  + 'VALUES (@phch, @dlv, @datax, @vsh)'
const insgroupe = 'INSERT INTO groupe (id, v, dfh, st, mxim, imh, v1, v2, f1, f2, mcg, vsh)'
  + 'VALUES (@id, @v, @dfh, @st, @mxim, @imh, @v1, @v2, @f1, @f2, @mcg, @vsh)'
const insmembre = 'INSERT INTO membre (id, im, v, st, vote, mc, infok, datag, ardg, vsh)'
  + 'VALUES (@id, @im, @v, @st, @vote, @mc, @infok, @datag, @ardg, @vsh)'
const insinvitgr = 'INSERT INTO invitgr (id, ni, datap) '
   + 'VALUES (@id, @ni, @datap)'
const insinvitcp = 'INSERT INTO invitcp (id, ni, datap) '
   + 'VALUES (@id, @ni, @datap)'  
const inssecret = 'INSERT INTO secret (id, ns, x, v, st, xp, v1, v2, mc, txts, mfas, refs, vsh) ' +
  'VALUES (@id, @ns, @x, @v, @st, @xp, @v1, @v2, @mc, @txts, @mfas, @refs, @vsh)'

const seltribu = 'SELECT * FROM tribu'
const seltribuId = 'SELECT * FROM tribu WHERE id = @id'
const selchatId = 'SELECT * FROM chat WHERE id = @id'
// eslint-disable-next-line no-unused-vars
const selchatDhst = 'SELECT * FROM chat WHERE dhde >= @dhde and st >= @st'
const selgcvol = 'SELECT * FROM gcvol'

const selavrsapub = 'SELECT clepub FROM avrsa WHERE id = @id'

const selcompteId = 'SELECT * FROM compte WHERE id = @id'
const selcompteIdv = 'SELECT v FROM compte WHERE id = @id'
const selcompteDpbh = 'SELECT * FROM compte WHERE dpbh = @dpbh'

const selprefsId = 'SELECT * FROM prefs WHERE id = @id'

const selcompta = 'SELECT * FROM compta WHERE id = @id AND v > @v'
const selcomptaId = 'SELECT * FROM compta WHERE id = @id'

const selavatar = 'SELECT * FROM avatar WHERE id = @id AND v > @v'
const selavatarId = 'SELECT * FROM avatar WHERE id = @id'
const selavatarIdv = 'SELECT v FROM avatar WHERE id = @id'

const selcouple = 'SELECT * FROM couple WHERE id = @id AND v > @v'
const selcoupleId = 'SELECT * FROM couple WHERE id = @id'

const selgroupe = 'SELECT * FROM groupe WHERE id = @id AND v > @v'
const selgroupeId = 'SELECT * FROM groupe WHERE id = @id'

const selcontactPhch = 'SELECT * FROM contact WHERE phch = @phch'
const selcvId = 'SELECT * FROM cv WHERE id = @id'

const selsecret = 'SELECT * FROM secret WHERE id = @id AND v > @v'
const selsecretIdNs = 'SELECT * FROM secret WHERE id = @id AND ns = @ns'

const selmembre = 'SELECT * FROM membre WHERE id = @id AND v > @v'
const selmembreIdIm = 'SELECT * FROM membre WHERE id = @id AND im = @im'
const selactifsmembre = 'SELECT COUNT(im) FROM membre WHERE id = @id AND st >= 10 AND st < 30'

const selinvitgrId = 'SELECT * FROM invitgr WHERE id = @id'

const selinvitcpId = 'SELECT * FROM invitcp WHERE id = @id'

function idx (id) {
  return (id % (nbVersions - 1)) + 1
}

/* Template d'opération de MAJ ******************************
args:
  -sessionId
Retour: result
  -ok :
*/

async function templateMAJ (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(templateMAJTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })

  result.rowItems = rowItems
  result.ok = args.ok
  return result
}
m1fonctions.templateMAJ = templateMAJ

function templateMAJTr(cfg, args, rowItems) {
  const c = stmt(cfg, selcompteIdv).get({ id : args.idc })
  if (!c || c.v > args.vc) { args.ok = false; return }
  rowItems.push(newItem('compte', c))
  args.ok = true
}

/************************************************* */
function clepubComptable (cfg) {
  if (!cfg.clepubC) {
    const c = stmt(cfg, selavrsapub).get({ id: IDCOMPTABLE })
    if (!c) throw new AppExc(A_SRV, '01-Clé publique du comptable inconnue')
    cfg.clepubC = c.clepub
  }
  return cfg.clepub
}

/* Creation du compte d'un comptable ****************************************
- sessionId, clePubAv, rowCompte, rowCompta, rowAvatar, rowPrefs
Retour :
- sessionId
- dh
*/
function creationCompteComptable (cfg, args) {
  const session = checkSession(args.sessionId)
  const compte = schemas.deserialize('rowcompte', args.rowCompte)

  if (cfg.comptable !== compte.pcbh) {
    throw new AppExc(X_SRV, '02-Cette phrase secrète n\'est pas reconnue comme étant celle du comptable de l\'organisation')
  }
  if (compte.id !== IDCOMPTABLE) {
    throw new AppExc(X_SRV, '02-Erreur d\'ID pour le compte Comptable')
  }

  const result = { sessionId: args.sessionId, dh: getdhc() }
  const compta = schemas.deserialize('rowcompta', args.rowCompta)
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)
  const prefs = schemas.deserialize('rowprefs', args.rowPrefs)
  const cv = { id: avatar.id, v: 0, x: 0, dds: 0, cv: null, vsh: 0 }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(compte.id)
  versions[j]++
  compte.v = versions[j]
  prefs.v = versions[j]
  avatar.v = versions[j]
  compta.v = versions[j]

  versions[0]++
  cv.v = versions[0]
  setValue(cfg, VERSIONS)

  cv.dds = new DateJour().nbj - 14
  const avrsa = { id: avatar.id, clepub: args.clePubAv, vsh: 0 }

  cfg.db.transaction(creationCompteComptableTr)(cfg, compte, compta, prefs, avatar, cv, avrsa)
  cfg.clepubC = avrsa.clepub
  session.compteId = compte.id
  session.plusAvatars([avatar.id])
  result.rowItems = [newItem('compte', compte), newItem('compta', compta), newItem('prefs', prefs), newItem('avatar', avatar)]
  return result
}
m1fonctions.creationCompteComptable = creationCompteComptable

function creationCompteComptableTr (cfg, compte, compta, prefs, avatar, cv, avrsa) {
  const c = stmt(cfg, selcompteId).get({ id: compte.id })
  if (c) {
    throw new AppExc(X_SRV, '03-Compte Comptable déjà créé')
  }

  stmt(cfg, inscompte).run(compte)
  stmt(cfg, inscompta).run(compta)
  stmt(cfg, insavatar).run(avatar)
  stmt(cfg, insprefs).run(prefs)
  stmt(cfg, inscv).run(cv)
  stmt(cfg, insavrsa).run(avrsa)
}

/* Creation d'une tribu ****************************************
- sessionId, rowTribu
Retour :
- sessionId
- dh
*/
function nouvelleTribu (cfg, args) {
  checkSession(args.sessionId)
  const tribu = schemas.deserialize('rowtribu', args.rowTribu)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(tribu.id)
  versions[j]++
  tribu.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []

  cfg.db.transaction(nouvelleTribuTr)(cfg, tribu, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.nouvelleTribu = nouvelleTribu

function nouvelleTribuTr (cfg, tribu, rowItems) {
  stmt(cfg, instribu).run(tribu)
  rowItems.push(newItem('tribu', tribu))
}

/* Maj info / reserves d'une tribu ****************************************
- sessionId
- idt: id de la tribu
- datak: peut être null
- reserves: peut être null
Retour :
- sessionId
- dh
*/
function inforesTribu (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idt)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []

  cfg.db.transaction(inforesTribuTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.inforesTribu = inforesTribu

const updinforestribu = 'UPDATE tribu SET datak = @datak, r1 = @r1, r2 = @r2 WHERE id = @id'

function inforesTribuTr (cfg, args, rowItems) {
  const tribu = stmt(cfg, seltribuId).get({ id: args.idt})
  if (!tribu) throw new AppExc(A_SRV, '08-Tribu non trouvée')
  tribu.v = args.v
  if (args.datak) tribu.datak = args.datak
  if (args.reserves) {
    tribu.r1 = args.reserves[0]
    tribu.r2 = args.reserves[1]
  }
  stmt(cfg, updinforestribu).run(tribu)
  rowItems.push(newItem('tribu', tribu))
}

/* Gérer les forfaits ******************************
args:
  - sessionId
  - idt : id de la tribu
  - idc : id du compte à gérer
  - f1t, f2t : forfaits de la tribu avant l'opération
  - f1c, f2c : forfaits du compte avant l'opération
  - dv1, dv2 : variation des forfaits
Retour: result
  - ok : si false, situation de concurrence de mise à jour
  - rowItems : compta, tribu
*/

async function gererForfaits (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idt)
  versions[j]++
  args.vt = versions[j]

  j = idx(args.idc)
  versions[j]++
  args.vc = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(gererForfaitsTr)(cfg, args, rowItems)
  if (args.ok) {
    syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
    setImmediate(() => { processQueue() })
  }
  result.rowItems = rowItems
  result.ok = args.ok
  return result
}
m1fonctions.gererForfaits = gererForfaits

const updfrtribu = 'UPDATE tribu SET v = @v, f1 = @f1, f2 = @f2 , r1 = @r1, r2 = @r2 WHERE id = @id'

function gererForfaitsTr(cfg, args, rowItems) {
  const c = stmt(cfg, selcomptaId).get({ id : args.idc })
  if (!c) throw new AppExc(A_SRV, '12-Compta not trouvée')
  const compteurs = new Compteurs(c.data)

  const t = stmt(cfg, seltribuId).get({ id : args.idt })
  if (!t) throw new AppExc(A_SRV, '12-Tribu not trouvée')

  if (args.f1t !== t.f1 || args.f2t !== t.f2 || args.f1c !== compteurs.f1 || args.f2c !== compteurs.f2) {
    args.ok = false
    rowItems.push(newItem('compta', c))
    rowItems.push(newItem('tribu', t))
    return
  }

  c.v = args.vc
  compteurs.f1 += args.dv1
  compteurs.f2 += args.dv2
  c.data = compteurs.serial
  stmt(cfg, updcompta).run(c)

  t.f1 += args.dv1
  t.f2 += args.dv2
  t.r1 += -args.dv1
  t.r2 += -args.dv2
  t.v = args.vt
  stmt(cfg, updfrtribu).run(t)

  rowItems.push(newItem('compta', c))
  rowItems.push(newItem('tribu', t))
  args.ok = true
}

/***************************************************
Répartir les forfait entre les avatars d'un compte
args:
  - sessionId
  - map avec une entrée par avatar dont les forfaits changent
    - clé: id
    - valeur:
      - f1 f2 f1n f2n valeurs du forfait avant et après
      - t : 0:secondaire, 1:primaire (pour gérer s1 s2)
Retour: result
  - ok : si false, situation de concurrence de mise à jour
*/

async function repartirForfait (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const versions = getValue(cfg, VERSIONS)
  for (const ids in args.map) {
    const id = parseInt(ids)
    const x = args.map[ids]
    const j = idx(id)
    versions[j]++
    x.v = versions[j]
  }
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(repartirForfaitTr)(cfg, args, rowItems)
  if (args.ok) {
    syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
    setImmediate(() => { processQueue() })
  }
  result.ok = args.ok
  return result
}
m1fonctions.repartirForfait = repartirForfait

function repartirForfaitTr(cfg, args, rowItems) {
  const lst = []
  for (const idx in args.map) {
    const id = parseInt(idx)
    const x = args.map[idx]
    const compta = stmt(cfg, selcomptaId).get({ id: id })
    if (!compta) throw new AppExc(A_SRV, '12-Compta not trouvée')
    const c = new Compteurs(compta.data)
    if (c.f1 !== x.f1 || c.f2 !== x.f2) { args.ok = false; return }
    if (x.t) {
      c.s1 += x.f1 - x.f1n
      c.s2 += x.f2 - x.f2n
    }
    c.f1 = x.f1n
    c.f2 = x.f2n
    compta.data = c.serial
    compta.v = x.v
    lst.push(compta)
  }

  lst.forEach(compta => {
    stmt(cfg, updcompta).run(compta)
    rowItems.push(newItem('compta', compta))
  })

  args.ok = true
}

/************************************************************
Connexion à un compte
Détermine si les hash de la phrase secrète en argument correspond à un compte.
RAZ des abonnements en cours et abonnement au compte
args
- dpbh
- pcbh
Retour
- rowCompte, rowPrefs, rowChat
- clepubc : clé publique du comptable
*/
async function connexionCompte (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  cfg.db.transaction(connexionCompteTr)(cfg, args, result)
  session.setCompte(args.id) // RAZ des abonnements et abonnement au compte
  result.clepubc = clepubComptable(cfg)
  return result
}
m1fonctions.connexionCompte = connexionCompte

function connexionCompteTr(cfg, args, result) {
  const compte = stmt(cfg, selcompteDpbh).get({ dpbh: args.dpbh })
  if (!compte || (compte.pcbh !== args.pcbh)) {
    throw new AppExc(X_SRV, '08-Compte non authentifié : aucun compte n\'est déclaré avec cette phrase secrète')
  }
  args.id = compte.id
  const prefs = stmt(cfg, selprefsId).get({ id: compte.id })
  result.rowCompte = newItem('compte', compte)
  result.rowPrefs = prefs ? newItem('prefs', prefs) : null
  if (compte.id !== IDCOMPTABLE) {
    const chat = stmt(cfg, selchatId).get({ id: compte.id })
    result.rowChat = chat ? newItem('chat', chat) : null
  }
}

/* Changement de phrase secrète
Args:
- id
- dpbh
- pcbh
- kx
*/
async function changementPS (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(changementPSTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.changementPS = changementPS

const updpscompte = 'UPDATE compte SET v = @v, dpbh = @dpbh, pcbh = @pcbh, kx = @kx WHERE id = @id'

function changementPSTr(cfg, args, rowItems) {
  const compte = stmt(cfg, selcompteId).get({ id: args.id })
  if (!compte) throw new AppExc(A_SRV, '08-Compte non trouvé')
  compte.v = args.v
  compte.dpbh = args.dpbh
  compte.pcbh = args.pcbh
  compte.kx = args.kx
  stmt(cfg, updpscompte).run(compte)
  rowItems.push(newItem('compte', compte))
}

/* Normalise nctk, crypté par la clé K au lieu du cryptage RSA par la clé publique du compte
Pas de synchro, c'est inutile
*/
async function nctkCompte (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  cfg.db.transaction(nctkCompteTr)(cfg, args, result)
  return result
}
m1fonctions.nctkCompte = nctkCompte

const updtribucompte = 'UPDATE compte SET nctk = @nctk, chkt = @chkt, nctpc = @nctpc WHERE id = @id'

function nctkCompteTr(cfg, args) {
  const compte = stmt(cfg, selcompteId).get({ id: args.id })
  if (!compte) {
    throw new AppExc(A_SRV, '08-Compte non trouvé')
  }
  compte.nctk = args.nctk
  stmt(cfg, updtribucompte).run(compte)
}

/* MAJ de la compta du compte primaire lors de la connexion
Args:
- sessionId
- idc
- v1c
- v2c
*/
async function majComptaP (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idc)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  cfg.db.transaction(majComptaPTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.majComptaP = majComptaP

function majComptaPTr(cfg, args, rowItems) {
  const compta = stmt(cfg, selcomptaId).get({ id: args.idc })
  if (!compta) throw new AppExc(A_SRV, '08-Compta non trouvé')
  
  compta.v = args.v
  const compteurs = new Compteurs(compta.data)
  compteurs.v1c = args.v1c
  compteurs.v2c = args.v2c
  compta.data = compteurs.serial

  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))
}

/************************************************************
GC des volumes
args
- dpbh
- pcbh
- vcompte vprefs
Retour
- rowItems : les rows gcvol
*/
async function collecteVolumes (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  const rows = stmt(cfg, selgcvol).all()
  rows.forEach((row) => { 
    rowItems.push(newItem('gcvol', row))
  })
  result.rowItems = rowItems
  return result
}
m1fonctions.collecteVolumes = collecteVolumes

/* Mise à jour des volumes récupérés par le GC - majVolumes
- sessionId
- maxdh : dh maximale desrécupération de volumes collectés
- map :
  - clé : id tribu
  - valeur:
    - chkt : pour un parrain seulement, hash (integer) de (id avatar base64 + id tribu base64)
    - v1 : volume v1 à restituer
    - v2 : volume v2 à restituer
Supprime les rows gcvol traités
*/
async function majVolumes (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  for (const id of args.map) {
    const j = idx(id)
    versions[j]++
    args.map[id].v = versions[j]
  }
  setValue(cfg, VERSIONS)

  cfg.db.transaction(majVolumesTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.majVolumes = majVolumes

const upd1tribu = 'UPDATE tribu SET v = @v, f1 = @f1, f2 = @f2, r1 = @r1, r2 = @r2, mncpt = @mncpt WHERE id = @id'
const delgcvol = 'DELETE FROM gcvol WHERE id > @id'

function majVolumesTr (cfg, args, rowItems) {
  for (const idx of args.map) {
    const id = parseInt(idx)
    const x = args.map[idx]
    const row = stmt(cfg, seltribuId).all({ id })
    if (row) {
      /*
      - `nbc` : nombre de comptes actifs dans la tribu.
      - `f1 f2` : sommes des volumes V1 et V2 déjà attribués comme forfaits aux comptes de la tribu.
      - `r1 r2` : volumes V1 et V2 en réserve pour attribution aux comptes actuels et futurs de la tribu.
      */
      row.v = x.v
      row.nbc -= 1
      row.f1 -= x.f1
      row.f2 -= x.f2
      row.r1 += x.f1
      row.r2 += x.f2
      if (x.chkt) { // c'était un parrain, on l'enlève de la map des parrains de la tribu
        const m = row.mncpt ? deserial(row.mncpt) : null
        if (m) {
          delete m[x.chkt]
          row.mncpt = serial(m)
        }
      }
      stmt(cfg, upd1tribu).run(row)
      rowItems.push(newItem('tribu', row))
    }
  }
  stmt(cfg, delgcvol).run({ id: args.maxdh })
}

/***********************************
Nouveau message chat
args:
- sessionId
- id: du compte
- c : true si émis par le comptable
- st : statut du chat (0, 1, 2) après le message
- it : {c, t, r} crypté par la clé C du chat
*/
async function nouveauChat (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  cfg.db.transaction(nouveauChatTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.nouveauChat = nouveauChat

const upd1chat = 'UPDATE chat SET v = @v, st = @st, dhde = @dhde, luc = @luc, lua = @lua, items = @items WHERE id = @id'

function nouveauChatTr (cfg, args, rowItems) {
  const c = stmt(cfg, selchatId).get({ id: args.id })
  if (!c) throw new AppExc(A_SRV, '22-chat non trouvé')
  c.v = args.v
  c.st = args.st
  const dh = new Date().getTime()
  const lim = dh - (86400000 * (cfg.nbjChat || 60))
  if (args.c) c.luc = dh; else { c.lua = dh; c.dhde = dh }
  const items = []
  const av = (c.items ? deserial(c.items) : null) || []
  for (let i = 0; i < av.length; i++) {
    const item = av[i]
    if (i < cfg.minItemsChat) {
      items.push(item)
    } else {
      if (item[0] > lim) items.push(item); else break
    }
  }
  items.push([dh, args.it])
  c.items = serial(items)
  stmt(cfg, upd1chat).run(c)
  rowItems.push(newItem('chat', c))
}

/***********************************
Avis de lecture de chat
args:
- sessionId
- id: du compte
- c : true si émis par le comptable
*/
async function lectureChat (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  cfg.db.transaction(lectureChatTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.lectureChat = lectureChat

const upd2chat = 'UPDATE chat SET v = @v, luc = @luc, lua = @lua WHERE id = @id'

function lectureChatTr (cfg, args, rowItems) {
  const c = stmt(cfg, selchatId).get({ id: args.id })
  if (!c) throw new AppExc(A_SRV, '22-chat non trouvé')
  c.v = args.v
  const dh = new Date().getTime()
  if (args.c) c.luc = dh; else c.lua = dh
  stmt(cfg, upd2chat).run(c)
  rowItems.push(newItem('chat', c))
}

/***********************************
Reset de chat
args:
- sessionId
- id: du compte
- `nrc` : `[nom, rnd, cle]` nom complet du _compte_,
  crypté par la clé publique du comptable.
  cle est la clé C de cryptage du chat (immuable, générée à la création).
- `ck` : cle C cryptée par la clé K du compte.

*/
async function resetChat (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  cfg.db.transaction(resetChatTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  result.rowItems = rowItems
  return result
}
m1fonctions.resetChat = resetChat

const delchat = 'DELETE FROM chat WHERE id = @id'

function resetChatTr (cfg, args, rowItems) {
  stmt(cfg, delchat).run({ id: args.id })
  const chat = { id: args.id, v: args.v, dhde: 0, lua: 0, luc: 0, st: 0, nrc: args.nrc, ck: args.ck, items: null, vsh: 0 }
  stmt(cfg, inschat).run(chat)
  rowItems.push(newItem('chat', chat))
}

/***********************************
Sélection de chats
args:
- sessionId
- dhde: min
- st: min
- id : Si présent, par convention la liste ne contient que le seul
chat ayant cet id sans tenir compte des autres critères
Retourne une liste de selchat : {id, dhde, st, nrc, cv, stp, nctpc}
- `nrc` : `[nom, rnd, cle]` crypté par la clé publique du comptable. 
  cle est la clé C de cryptage du chat (immuable, générée à la création).
- stc : stp de son row compta
- `nctpc` : nom complet `[nom, rnd]` de la tribu cryptée par la clé publique du comptable.
*/
async function selectChat (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []

  if (!args.id) {
    const rows = stmt(cfg, selchat).all({ dhde: args.dhde, st: args.st })
    rows.forEach((row) => { rowItems.push(newItem('selchat', row)) })
  } else {
    const row = stmt(cfg, selchat2).get({ id: args.id })
    if (row) rowItems.push(newItem('selchat', row))
  }

  result.rowItems = rowItems
  return result
}
m1fonctions.selectChat = selectChat

const selchat = `SELECT
chat.id AS id, 
chat.dhde AS dhde,
chat.st AS st,
chat.nrc AS nrc,
cv.cv AS cv,
compte.stp AS stp,
compte.nctpc AS nctpc
FROM chat, cv, compte
WHERE
chat.dhde >= @dhde
AND chat.st >= @st
AND cv.id = chat.id
AND compte.id = chat.id`

const selchat2 = `SELECT
chat.id AS id, 
chat.dhde AS dhde,
chat.st AS st,
chat.nrc AS nrc,
cv.cv AS cv,
compte.stp AS stp,
compte.nctpc AS nctpc
FROM chat, cv, compte
WHERE
chat.id >= @id
AND cv.id = chat.id
AND compte.id = chat.id`

/***********************************
Get chat, pour le comptable seulement
args:
- sessionId
- id
Retourne le chat
*/
async function getChat (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []

  const row = stmt(cfg, selchatId).get({ id: args.id })
  if (!row) throw new AppExc(A_SRV, 'Chat non trouvé')
  rowItems.push(newItem('chat', row))

  result.rowItems = rowItems
  session.setChat(args.id)
  return result
}
m1fonctions.getChat = getChat

/***********************************
Get compta, pour le comptable seulement
args:
- sessionId
- id
Retourne le row compta
*/
async function getCompta (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  result.parrain = true
  const row = stmt(cfg, selcomptaId).get({ id: args.id })
  if (!row) throw new AppExc(A_SRV, 'Compta non trouvé')
  rowItems.push(newItem('compta', row))

  result.rowItems = rowItems
  return result
}
m1fonctions.getCompta = getCompta

/***********************************
Get parrain / tribu d'uncompte, pour le comptable seulement
args:
- sessionId
- id : id du compte
Retourne:
result.parrain : 1 si parrain
result.nctpc : nom complet `[nom, rnd]` de la tribu cryptée par la clé publique du comptable.
*/
async function getTribuCompte (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const row = stmt(cfg, selcompteId).get({ id: args.id })
  if (!row) throw new AppExc(A_SRV, 'Compte non trouvé')
  result.parrain = row.stp
  result.nctpc = row.nctpc

  return result
}
m1fonctions.getTribuCompte = getTribuCompte

/***********************************
Est parrain de ma tribu ?
args:
- sessionId
- id : id du compte testé
- chkt: du compte testeur
Retourne:
result.statut :
0 - id n'est pas primaire
1 - id est primaire pas de la même tribu
2 - id est primaire et de la même tribu
3 - id est parrain de la même tribu
*/
async function estParrainTribu (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }

  const row = stmt(cfg, selcompteId).get({ id: args.id })
  if (!row) {
    result.statut = 0
  } else {
    if (row.chkt !== args.chkt) {
      result.statut = 1
    } else {
      result.statut = row.stp ? 3 : 2
    }
  }
  return result
}
m1fonctions.estParrainTribu = estParrainTribu

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
async function chargerAvatars (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(chargerAvatarsTr)(cfg, args, rowItems)
  result.rowItems = rowItems
  result.ok = args.ok
  session.plusAvatars(args.ids)
  return result
}
m1fonctions.chargerAvatars = chargerAvatars

function chargerAvatarsTr(cfg, args, rowItems) {
  const c = stmt(cfg, selcompteIdv).get({ id : args.idc })
  if (!c || c.v > args.vc) { args.ok = false; return }
  args.ok = true
  args.ids = []
  for(const ids in args.idsVers) {
    const id = parseInt(ids)
    args.ids.push(id)
    const row = stmt(cfg, selavatar).get({ id, v: args.idsVers[id] })
    if (row) rowItems.push(newItem('avatar', row))
  }
  for(const ids in args.cptidsVers) {
    const id = parseInt(ids)
    const row = stmt(cfg, selcompta).get({ id, v: args.cptidsVers[id] })
    if (row) rowItems.push(newItem('compta', row))
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

async function chargerC (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(chargerCTr)(cfg, args.id, rowItems)
  result.rowItems = rowItems
  session.plusCouples([args.id])
  return result
}
m1fonctions.chargerC = chargerC

async function chargerS (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  cfg.db.transaction(chargerSTr)(cfg, args.id, rowItems)
  result.rowItems = rowItems
  session.plusCouples2([args.id])
  return result
}
m1fonctions.chargerS = chargerS

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

function chargerSTr(cfg, id, rowItems) {
  const rows = stmt(cfg, selsecretId).all({ id : id })
  rows.forEach((row) => { rowItems.push(newItem('secret', row)) })
}

function chargerCTr(cfg, id, rowItems) {
  const row = stmt(cfg, selcoupleId).get({ id : id })
  rowItems.push(newItem('couple', row))
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
Abonnements aux secrets des couples
*/
async function aboCpSec (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  session.plusCouples2(args.lids)
  return result
}
m1fonctions.aboCpSec = aboCpSec

/********************************************************
Chargement des groupes et couples des avatars d'un compte
Abonnements et signatures
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

function chargerGrCpTr(cfg, args, grIds, cpIds, rowItems) {
  const c = stmt(cfg, selcompteIdv).get({ id : args.idc })
  if (!c || c.v > args.vc) { args.ok = false; return }
  const ids = []
  for (const idx in args.avidsVers) {
    const id = parseInt(idx)
    ids.push(id)
    const a = stmt(cfg, selavatarIdv).get({ id })
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

const updddscv= 'UPDATE cv SET dds = @dds WHERE id = @id'
const ddscv = 'SELECT dds FROM cv WHERE id = @id'

function signatures (cfg, idc, lagc) {
  const c = stmt(cfg, ddscv).get({ id: idc })
  let j = new DateJour().nbj
  if (c.dds > j - 28) return
  j -= 14
  stmt(cfg, updddscv).run({ id: idc, dds: j })
  lagc.forEach((id) => {
    if (id !== idc) stmt(cfg, updddscv).run({ id: id, dds: j + Math.floor(Math.random() * 14) })
  })
}

/********************************************************
Chargement des secrets d'un objet maître (avatar / groupe / couple)
dont la version est postérieure à v
args :
- sessionId
- id : id de l'objet maître
- v : version min
- cpl : si true, c'est un couple à abonner aux secrets
Retour
- rowItems : contient des rowItems de secrets
(ceux ayant une version supérieure à celle détenue en session)
*/
async function chargerSc (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  result.rowItems = rowItems
  const rows = stmt(cfg, selsecret).all({ id: args.id, v: args.v })
  rows.forEach((row) => {
    result.rowItems.push(newItem('secret', row))
  })
  if (args.cpl) session.plusCouples2([args.id])
  return result
}
m1fonctions.chargerSc = chargerSc

/********************************************************
Chargement des tribus ou de celle dont l'id est donnée (et dans ce cas abonnement)
args :
- sessionId
- id : si id = 0, charger toutes
Retour
- rowItems : contient des rowItems des tribus
*/
async function chargerTribus (cfg, args) {
  const session = checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc() }
  const rowItems = []
  result.rowItems = rowItems
  if (args.id) {
    const row = stmt(cfg, seltribuId).get({id: args.id })
    result.rowItems.push(newItem('tribu', row))
    session.setTribu(args.id)
  } else {
    const rows = stmt(cfg, seltribu).all()
    rows.forEach((row) => {
      result.rowItems.push(newItem('tribu', row))
    })
  }
  return result
}
m1fonctions.chargerTribus = chargerTribus

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
- idc: id du compte
- vcav: version du compte avant (ne doit pas avoir changé),
- mack: map des avatars dans le compte
- rowAvatar: du nouvel avatar
- rowCompta: du nouvel avatar
- forfaits: prélevés sur l'avatar primitif
Retour :
- sessionId
- dh
- statut : 0:OK, 1:retry (version compte ayant évolué)
X_SRV, '26-Forfait V1 insuffisant pour l\'attribution souhaitée au nouvel avatar'
X_SRV, '27-Forfait V2 insuffisant pour l\'attribution souhaitée au nouvel avatar'
A_SRV, '06-Compte non trouvé'
*/
function creationAvatar (cfg, args) {
  const session = checkSession(args.sessionId)

  const result = { sessionId: args.sessionId, dh: getdhc() }
  const avatar = schemas.deserialize('rowavatar', args.rowAvatar)
  const compta = schemas.deserialize('rowcompta', args.rowCompta)
  const avrsa = { id: avatar.id, clepub: args.clePub, vsh: 0 }
  const cv = { id: avatar.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(), cv: null, vsh: 0 }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc2 = versions[j]

  j = idx(avatar.id)
  versions[j]++
  avatar.v = versions[j]
  compta.v = versions[j]

  versions[0]++ // version des CVs
  cv.v = versions[0]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(creationAvatarTr)(cfg, session, args, avatar, compta, avrsa, cv, rowItems)

  if (args.statut === 1) {
    result.statut = 1
    return result
  }

  syncListQueue.push({ sessionId: args.sessionId, dh: result.dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  session.plusAvatars([avatar.id])
  session.plusCvs([avatar.id])
  result.statut = 0
  return result
}
m1fonctions.creationAvatar = creationAvatar

const upd1compte = 'UPDATE compte SET v = @v, mack = @mack WHERE id = @id'

function creationAvatarTr (cfg, session, args, avatar, compta, avrsa, cv, rowItems) {
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

  const cprim = stmt(cfg, selcomptaId).get({ id: args.idc })
  if (!cprim) throw new AppExc(A_SRV, '06-Compta non trouvé')

  {
    cprim.v = args.vc2
    const compteurs = new Compteurs(cprim.data)
    const ok = compteurs.setAS(args.forfaits)
    if (!ok) throw new AppExc(X_SRV, '26-Forfait V1 insuffisant pour l\'attribution souhaitée au nouvel avatar')
    cprim.data = compteurs.serial
    stmt(cfg, updcompta).run(cprim)
    rowItems.push(newItem('compta', cprim))
  }
  {
    const compteurs = new Compteurs(compta.data)
    compteurs.setF1(args.forfaits[0])
    compteurs.setF2(args.forfaits[1])
    compta.data = compteurs.serial
    stmt(cfg, inscompta).run(compta)
    rowItems.push(newItem('compta', compta))  
  }

  stmt(cfg, insavatar).run(avatar)
  rowItems.push(newItem('avatar', avatar))

  stmt(cfg, insavrsa).run(avrsa)

  stmt(cfg, inscv).run(cv)
  rowItems.push(newItem('cv', cv))
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
  versions[0]++
  setValue(cfg, VERSIONS)
  const v = versions[0]

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

const updstmembre = 'UPDATE membre SET v = @v, st = @st WHERE id = @id AND im = @im'
const updstcouple = 'UPDATE couple SET v = @v, st = @st WHERE id = @id'
const updstvcouple = 'UPDATE couple SET v = @v, st = @st, v1 = @v1, v2 = @v2 WHERE id = @id'
const updstmxcouple = 'UPDATE couple SET v = @v, st = @st, mx10 = @mx10, mx20 = @mx20, mx11 = @mx11, mx21 = @mx21 WHERE id = @id'

/* Régularisation Groupe / Couple ****************************************
Mise à jour de lgrk / lcck dans l'avatar et suppression du row invitgr / invitcp
args
- id : de l'avatar
- idg / idc: id du groupe / couple (pour s'abonner)
- ni : numéro d'invitation du groupe à inscrire
- datak : 
  - [nom, rnd, im] du groupe à inscrire dans lgrk de l'avatar
  - cc clé du couple à inscrire dans lcck de l'avatar
*/

const upd1avatar = 'UPDATE avatar SET v = @v, lgrk = @lgrk WHERE id = @id'
const upd2avatar = 'UPDATE avatar SET v = @v, lcck = @lcck WHERE id = @id'
const delinvitgr = 'DELETE from invitgr WHERE id = @id AND ni = @ni'
const delinvitcp = 'DELETE from invitcp WHERE id = @id AND ni = @ni'

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
  cfg.db.transaction(regulGrTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  session.plusGroupes([args.idg])
  return result
}
m1fonctions.regulGr = regulGr

function regulGrTr (cfg, args, rowItems) {
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
}

async function regulCp (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }
  
  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.id)
  versions[j]++
  args.v = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(regulCpTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  session.plusCouples([args.idc])
  return result
}
m1fonctions.regulCp = regulCp

function regulCpTr (cfg, args, rowItems) {
  const a = stmt(cfg, selavatarId).get({ id: args.id })
  if (!a) return // avatar supprimé depuis (?)
  let map = a.lgrk ? deserial(a.lcck) : {}
  if (!map) map = {}
  if (map[args.ni]) return // déjà fait
  map[args.ni] = args.datak
  a.v = args.v
  a.lcck = serial(map)
  stmt(cfg, upd2avatar).run(a)
  rowItems.push(newItem('avatar', a))
  stmt(cfg, delinvitcp).run({ id: args.id, ni: args.ni })
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
  const c = stmt(cfg, selcoupleId).get({ id: args.id })
  if (!c) return
  decorCouple(c)
  c.stp = 5
  if (args.idx === 0) c.st0 = 2; else c.st1 = 2
  setSt(c)
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
Chargement des invitCp des avatars d'un compte
- sessionId, ids (array des ids des avatars)
*/
async function chargerInvitCp (cfg, args) {
  checkSession(args.sessionId)
  const result = { sessionId: args.sessionId, dh: getdhc(), rowItems: [] }
  for (let i = 0; i < args.ids.length; i++) {
    const rows = stmt(cfg, selinvitcpId).all({ id: args.ids[i] })
    rows.forEach((row) => {
      result.rowItems.push(newItem('invitcp', row))
    })
  }
  return result
}
m1fonctions.chargerInvitCp = chargerInvitCp

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
async function getclepub (cfg, args) {
  checkSession(args.sessionId)
  try {
    const id = crypt.sidToId(args.sid)
    const c = stmt(cfg, selavrsapub).get({ id: id })
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
    const x = secret.mc ? deserial(secret.mc) : {}
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
MAJ secret
Args : 
- sessionId
- ts, id, ns, varg
refs N'EST PAS mis à null : reste nécessaire pour la synchronisation (mise à jour des voisins)
Retour :
- sessionId
- dh
- info
Exceptions
*/
const upd2secret = 'UPDATE secret SET v = @v, x = @x, st = 0, xp = 0, v1 = 0, v2 = 0, txts = null, mc = null, mfas = null WHERE id = @id AND ns = @ns'

async function supprSecret (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  volumes (cfg, args.varg)
  const rowItems = []

  cfg.db.transaction(supprSecretTr)(cfg, args, rowItems)
  if (args.lidf.length) cfg.storage.delFiles(cfg.code, args.id, args.lidf)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh, info: args.info }
}
m1fonctions.supprSecret = supprSecret

function supprSecretTr (cfg, args, rowItems) {

  const s = stmt(cfg, selsecretIdNs).get({ id: args.id, ns: args.ns }) 
  if (!s) throw new AppExc(A_SRV, '13-Secret inexistant')
  args.varg.dv1 = s.v1 ? -s.v1 : 0
  args.varg.dv2 = s.v2 ? -s.v2 : 0 // par erreur v1 ou v2 ont pu avoir null
  args.info = volumesTr (cfg, args.varg, rowItems)

  s.v = args.varg.vs
  s.x = new DateJour().nbj
  s.st = 0; s.xp = 0; s.v1 = 0; s.v2 = 0; s.txts = null; s.mc = null; s.mfas = null
  args.lidf = s.mfas ? Object.keys(s.mfas) : [] // liste des idf du secret
  stmt(cfg, upd2secret).run(s)
  rowItems.push(newItem('secret', s))
}

/******************************************************************
Nouveau Couple :
/* `lcck` : map : de avatar
    - _clé_ : `ni`, numéro pseudo aléatoire. Hash de (`cc` en hexa suivi de `0` ou `1`).
    - _valeur_ : clé `cc` cryptée par la clé K de l'avatar cible. Le hash d'une clé d'un couple donne son id.
args :
  - sessionid
  - id: id de l'avatar,
  - ni: clé d'accès à lcck de l'avatar
  - datak : terme ni de lcck
  - sec : true si avatar accède aux secrets du contact
  - rowCouple
  - rowInvitcp
A_SRV, '23-Avatar non trouvé.'
*/

async function nouveauCouple (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const couple = deserial(args.rowCouple)
  const invitcp = deserial(args.rowInvitcp)

  const versions = getValue(cfg, VERSIONS)
  let j = idx(couple.id)
  versions[j]++
  couple.v = versions[j] // version du row couple

  j = idx(args.id)
  versions[j]++
  args.v = versions[j] // version du row avatar 0

  j = idx(invitcp.id)
  versions[j]++
  invitcp.v = versions[j] // version du row avatar 1

  const cv = { id: couple.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(), cv: null, vsh: 0 }
  versions[0]++
  cv.v = versions[0] // version de la cv du couple

  setValue(cfg, VERSIONS)
  const rowItems = []

  cfg.db.transaction(nouveauCoupleTr)(cfg, args, couple, invitcp, cv, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  session.plusCouples([couple.id])
  if (args.sec) session.plusCouples2([couple.id])
  session.plusCvs([couple.id])
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.nouveauCouple = nouveauCouple

function nouveauCoupleTr (cfg, args, couple, invitcp, cv, rowItems) {
  const a = stmt(cfg, selavatarId).get({ id: args.id }) 
  if (!a) throw new AppExc(A_SRV, '13-Avatar A0 inexistant')

  stmt(cfg, inscouple).run(couple)
  rowItems.push(newItem('couple', couple))
  stmt(cfg, inscv).run(cv)
  rowItems.push(newItem('cv', cv))
  stmt(cfg, insinvitcp).run(invitcp)
  rowItems.push(newItem('invitcp', invitcp))

  const m = a.lcck ? deserial(a.lcck) : null
  const map = m || {}
  map[args.ni] = args.datak
  a.v = args.v
  a.lcck = serial(map)
  stmt(cfg, upd2avatar).run(a)
  rowItems.push(newItem('avatar', a))
}

/******************************************************************
Accepter couple
/* args :
  - sessionid
  - idc: id du couple
  - ard: ardoise
  - vmax : [mx10 mx20] ou [mx11 mx21]
A_SRV, '23-Avatar non trouvé.'
*/

async function accepterCouple (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idc)
  versions[j]++
  args.vc = versions[j] // version du row couple
  setValue(cfg, VERSIONS)

  const rowItems = []

  cfg.db.transaction(accepterCoupleTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  if (args.vmax[0]) session.plusCouples2([args.idc])
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.accepterCouple = accepterCouple

const upd4couple = 'UPDATE couple SET v = @v, st = @st, dlv = 0, mx11 = @mx11, mx21 = @mx21, mx10 = @mx10, mx20 = @mx20, ardc = @ardc WHERE id = @id'

function accepterCoupleTr (cfg, args, rowItems) {
  const c = stmt(cfg, selcoupleId).get({ id: args.idc }) 
  if (!c) throw new AppExc(A_SRV, '13-Couple non trouvé')

  c.v = args.vc
  decorCouple(c)
  c.stp = 4
  c.st1 = args.vmax[0] === 0 ? 0 : 1
  c.mx11 = args.vmax[0]
  c.mx21 = args.vmax[1]
  setSt(c)
  c.ardc = args.ardc
  stmt(cfg, upd4couple).run(c)
  rowItems.push(newItem('couple', c))
}

/******************************************************************
Décliner couple
/* args :
  - sessionid
  - idc: id du couple
  - id: id de l'avatar
  - ni : numéro d'invitation au couple
  - ard: ardoise
A_SRV, '23-Avatar non trouvé.'
*/

async function declinerCouple (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc = versions[j] // version du row couple
  j = idx(args.id)
  versions[j]++
  args.va = versions[j] // version de l'avatar
  setValue(cfg, VERSIONS)

  const rowItems = []

  cfg.db.transaction(declinerCoupleTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  session.moinsCouples([args.idc])
  session.moinsCouples2([args.idc])
  session.moinsCvs([args.idc])
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.declinerCouple = declinerCouple

function declinerCoupleTr (cfg, args, rowItems) {
  const c = stmt(cfg, selcoupleId).get({ id: args.idc }) 
  if (!c) throw new AppExc(A_SRV, '13-Couple non trouvé')

  c.v = args.vc
  decorCouple(c)
  c.stp = 3
  c.st1 = 0
  setSt(c)
  c.mx11 = 0
  c.mx21 = 0
  c.ardc = args.ardc
  stmt(cfg, upd4couple).run(c)
  rowItems.push(newItem('couple', c))

  const a = stmt(cfg, selavatarId).get({ id: args.id }) 
  if (!a) throw new AppExc(A_SRV, '13-Avatar non trouvé')
  const m = a.lcck ? deserial(a.lcck) : null
  const map = m || {}
  delete map[args.ni]
  a.v = args.va
  a.lcck = serial(map)
  stmt(cfg, upd2avatar).run(a)
  rowItems.push(newItem('avatar', a))
}

/******************************************************************
Nouveau parrainage / rencontre : args de m1/nouveauParrainage
  - sessionId: data.sessionId,
  - rowCouple
  - rowContact
  - id: id de l'avatar
  - ni: clé d'accès à lcck de l'avatar
  - datak : clé cc cryptée par la clé k
  - sec : true si avatar accède aux secrets du contact
  Retour : dh
  X_SRV, '14-Cette phrase de parrainage / rencontre est trop proche d\'une déjà enregistrée'
  X_SRV, '23-Avatar non trouvé.'
*/

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

  const cv = { id: couple.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(), cv: null, vsh: 0 }
  versions[0]++
  cv.v = versions[0] // version de la cv du contact

  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(nouveauParrainageTr)(cfg, args, contact, couple, cv, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems })
  setImmediate(() => { processQueue() })
  session.plusCouples([couple.id])
  session.plusCvs([couple.id])
  if (args.sec) session.plusCouples2([couple.id])
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.nouveauParrainage = nouveauParrainage

function nouveauParrainageTr (cfg, args, contact, couple, cv, rowItems) {
  const p = stmt(cfg, selcontactPhch).get({ phch: contact.phch })
  if (p) throw new AppExc(X_SRV, '14-Cette phrase de parrainage / rencontre est trop proche d\'une déjà enregistrée.')
  stmt(cfg, inscontact).run(contact)
  stmt(cfg, inscouple).run(couple)
  rowItems.push(newItem('couple', couple))

  const a = stmt(cfg, selavatarId).get({ id: args.id })
  if (!a) throw new AppExc(A_SRV, '23-Avatar non trouvé.')
  const m = a.lcck ? deserial(a.lcck) : null
  const map = m || {}
  if (map[args.ni]) return // déjà fait
  map[args.ni] = args.datak
  a.v = args.v
  a.lcck = serial(map)
  stmt(cfg, upd2avatar).run(a)
  rowItems.push(newItem('avatar', a))

  stmt(cfg, inscv).run(cv)
  rowItems.push(newItem('cv', cv))
}

/***********************************************
Prolongation d'un parrainage / rencontre
args
  - sessionId
  - idc : id du couple
  - phch : hash de la phrase de contact
  - dlv : nouvelle dlv
A_SRV, '14-Phrase de parrainage / rencontre non trouvée.'
A_SRV, '16-Couple non trouvé.'
*/
async function prolongerParrainage (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idc)
  versions[j]++
  args.v = versions[j] // version du row couple
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(prolongerParrainageTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems })
  setImmediate(() => { processQueue() })
  return { sessionId: args.sessionId, dh: dh }
}
m1fonctions.prolongerParrainage = prolongerParrainage

const updcontact = 'UPDATE contact SET dlv = @dlv WHERE pph = @pph'
const upddlvcouple = 'UPDATE couple SET dlv = @dlv, v = @v WHERE id = @id'

function prolongerParrainageTr (cfg, args, rowItems) {
  const p = stmt(cfg, selcontactPhch).get({ phch: args.phch })
  if (p) throw new AppExc(A_SRV, '14-Phrase de parrainage / rencontre non trouvée.')
  p.dlv = args.dlv
  stmt(cfg, updcontact).run(p)

  const c = stmt(cfg, selcoupleId).get({ id: args.ids })
  if (!c) throw new AppExc(A_SRV, '16-Couple non trouvé.')
  c.dlv = args.dlv
  c.v = args.v
  stmt(cfg, upddlvcouple).run(c)
  rowItems.push(newItem('couple', c))
}

/************************************************************
Suppression d'un couple
args:
- sessionId: data.sessionId,
- idc : id du couple
- ni : numéro d'invitation du couple pour l'avatar avid
- ni1 : numéro d'invitation du couple pour l'avatar 1
- avid : id de l'avatar demandeur
- avid1 : id de l'avatar 1
- phch : id du contact rencontre / parrain  à supprimer
- avc : l'avatar demandeur est le 0 ou le 1
Traitements :
- (a) supression de l'entrée ni de lcck sur l'avatar avid : tous
- (b) suppression de l'entréé ni1 lcck sur l'avatar avid1 : (stp 1 2, orig 0)
- (c) récupération des volumes sur l'avatar avid : stp = 5
- (d) suppression du couple : tous
- (e) suppression des secrets : stp = 5
- (f) suppression du contact (parrainage / rencontre) : phch (stp === 1 et orig 1 ou 2)
- (g) suppression invitcp : stp === 1 et orig 0
Retour:
A_SRV, '17-Avatar non trouvé'
A_SRV, '17-Avatar : données de comptabilité absentes'
*/
async function supprimerCouple (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.avid)
  versions[j]++
  args.vav = versions[j] // version de l'avatar (pour compta et lcck)

  if (args.avid1) { // version de avid1 (dans ce cas avid est av0)
    j = idx(args.avid1)
    versions[j]++
    args.vav1 = versions[j] // version du couple
  }
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(supprimerCoupleTr)(cfg, args, rowItems)

  result.rowItems = rowItems
  syncListQueue.push({ sessionId: args.sessionId, dh, rowItems}) // à synchroniser
  setImmediate(() => { processQueue() })

  // Désabonnements du compte
  session.moinsCouples([args.idc])
  session.moinsCouples2([args.idc])
  session.moinsCvs([args.idc])
  if (args.purgefic) await cfg.storage.delACP(cfg.code, args.idc)
  return result
}
m1fonctions.supprimerCouple = supprimerCouple

const delcouple = 'DELETE FROM couple WHERE id = @id'

function supprimerCoupleTr (cfg, args, rowItems) {
  const couple = stmt(cfg, selcoupleId).get({ id: args.idc })
  if (!couple) throw new AppExc(A_SRV, '17-Couple non trouvé')
  decorCouple(couple)
  args.purgefic = couple.v1 || couple.v2

  // (a)
  const a = stmt(cfg, selavatarId).get({ id: args.avid })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  const m = a.lcck ? deserial(a.lcck) : null
  const map = m || {}
  delete map[args.ni]
  a.v = args.vav
  a.lcck = serial(map)
  stmt(cfg, upd2avatar).run(a)
  rowItems.push(newItem('avatar', a))

  if (couple.sto === 0 && couple.stp <= 2) { // (b)
    const a = stmt(cfg, selavatarId).get({ id: args.avid1 })
    if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
    const m = a.lcck ? deserial(a.lcck) : null
    const map = m || {}
    delete map[args.ni1]
    a.v = args.vav1
    a.lcck = serial(map)
    stmt(cfg, upd2avatar).run(a)
    rowItems.push(newItem('avatar', a))
  }

  if (couple.stp === 5) { // (c)
    const compta = stmt(cfg, selcomptaId).get({ id: args.avid })
    if (!compta) throw new AppExc(A_SRV, '17-Avatar : données de comptabilité absentes')
    const compteurs = new Compteurs(compta.data)
    compteurs.setV1(-couple.v1)
    compteurs.setV2(-couple.v2)
    compta.v = args.vav
    compta.data = compteurs.calculauj().serial
    stmt(cfg, updcompta).run(compta)
    rowItems.push(newItem('compta', compta))
  }

  stmt(cfg, delcouple).run(couple) // (d)
  if (args.purgefic) stmt(cfg, delsecret).run({ id: couple.id }) // (e)
  if (args.phch) stmt(cfg, delcontact).run({ phch: args.phch }) // (f)
  if (couple.stp === 1 && couple.sto === 0) 
    stmt(cfg, delinvitcp).run({ id: args.avid1, ni : args.ni1 }) // (g)
}

function decorCouple (c, jourj) {
  if (!jourj) jourj = new DateJour().nbj
  const x = '' + c.st
  c.stp = parseInt(x.charAt(0))
  c.sto = parseInt(x.charAt(1))
  c.st0 = parseInt(x.charAt(2))
  c.st1 = parseInt(x.charAt(3))
  if (c.dlv && c.dlv < jourj) {
    if (c.stp === 1) { // si 1 attente, passe en phase 2 hors délai
      c.stp = 2
    }
  }
  return setSt(c)
}

function setSt (c) {
  c.st = c.st1 + (10 * c.st0) + (100 * c.sto) + (1000 * c.stp)
  return c
}

/************************************************************
Suspendre l'accès aux secrets d''un couple
args:
- sessionId: data.sessionId,
- idc : id du couple
- avid : id de l'avatar demandeur
- avc : l'avatar demandeur est le 0 ou le 1
Retour:
A_SRV, '17-Avatar non trouvé'
A_SRV, '17-Avatar : données de comptabilité absentes'
*/
async function suspendreCouple (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.avid)
  versions[j]++
  args.vav = versions[j] // version de l'avatar

  j = idx(args.idc)
  versions[j]++
  args.vc = versions[j] // version du couple
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(suspendreCoupleTr)(cfg, args, rowItems)

  result.rowItems = rowItems
  syncListQueue.push({ sessionId: args.sessionId, dh, rowItems}) // à synchroniser
  setImmediate(() => { processQueue() })

  // Désabonnements du compte
  session.moinsCouples2([args.idc])
  if (args.purgefic) await cfg.storage.delACP(cfg.code, args.idc)
  return result
}
m1fonctions.suspendreCouple = suspendreCouple

function suspendreCoupleTr (cfg, args, rowItems) {
  const jourj = new DateJour().nbj

  const compta = stmt(cfg, selcomptaId).get({ id: args.avid })
  if (!compta) throw new AppExc(A_SRV, '17-Avatar : données de comptabilité absentes')
  const couple = stmt(cfg, selcoupleId).get({ id: args.idc })
  if (!couple) throw new AppExc(A_SRV, '17-Couple non trouvé')

  const compteurs = new Compteurs(compta.data)
  compteurs.setV1(-couple.v1)
  compteurs.setV2(-couple.v2)
  compta.v = args.vav
  compta.data = compteurs.calculauj().serial
  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))

  decorCouple(couple, jourj)
  if (args.avc === 0) {
    couple.st0 = 0
    args.purgefic = (couple.st1 !== 1)
  } else {
    couple.st1 = 0
    args.purgefic = (couple.st0 !== 1)
  }
  setSt(couple)
  if (args.purgefic) {
    couple.v1 = 0
    couple.v2 = 0
    stmt(cfg, delsecret).run({ id: args.idc })
  }
  couple.v = args.vc
  stmt(cfg, updstvcouple).run(couple)
  rowItems.push(newItem('couple', couple))
}

/************************************************************
Réactiver l'accès aux secrets d''un couple
args:
- sessionId: data.sessionId,
- idc : id du couple
- avid : id de l'avatar demandeur
- max : volumes max
- avc : l'avatar demandeur est le 0 ou le 1
Retour:
A_SRV, '17-Avatar non trouvé'
A_SRV, '17-Avatar : données de comptabilité absentes'
X_SRV, '20-Forfait v1 insuffisant pour supporter les secrets du couple.'
X_SRV, '20-Forfait v2 insuffisant pour supporter les secrets du couple.'
*/
async function reactiverCouple (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.avid)
  versions[j]++
  args.vav = versions[j] // version de l'avatar

  j = idx(args.idc)
  versions[j]++
  args.vc = versions[j] // version du couple
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(reactiverCoupleTr)(cfg, args, rowItems)

  result.rowItems = rowItems
  syncListQueue.push({ sessionId: args.sessionId, dh, rowItems}) // à synchroniser
  setImmediate(() => { processQueue() })

  // Abonnements du compte
  session.plusCouples2([args.idc])
  return result
}
m1fonctions.reactiverCouple = reactiverCouple

function reactiverCoupleTr (cfg, args, rowItems) {
  const jourj = new DateJour().nbj

  const compta = stmt(cfg, selcomptaId).get({ id: args.avid })
  if (!compta) throw new AppExc(A_SRV, '17-Avatar : données de comptabilité absentes')
  const couple = stmt(cfg, selcoupleId).get({ id: args.idc })
  if (!couple) throw new AppExc(A_SRV, '17-Couple non trouvé')

  const compteurs = new Compteurs(compta.data)
  let ok = compteurs.setV1(couple.v1)
  if (!ok) throw new AppExc(X_SRV, '20-Forfait v1 insuffisant pour supporter les secrets du couple.')
  ok = compteurs.setV2(couple.v2)
  if (!ok) throw new AppExc(X_SRV, '20-Forfait v2 insuffisant pour supporter les secrets du couple.')
  compta.v = args.vav
  compta.data = compteurs.calculauj().serial
  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))

  decorCouple(couple, jourj)
  if (args.avc === 0) {
    couple.st0 = 1
    couple.mx10 = args.max[0]
    couple.mx20 = args.max[1]
  } else {
    couple.st1 = 1
    couple.mx11 = args.max[0]
    couple.mx21 = args.max[1]
  }
  setSt(couple)
  couple.v = args.vc
  stmt(cfg, updstmxcouple).run(couple)
  rowItems.push(newItem('couple', couple))
}

/************************************************************
Acceptation d'une rencontre
args :
  - sessionid
  - idc: id du couple
  - phch: id du contact
  - id: id de l'avatar
  - ni: clé d'accès à lcck de l'avatar
  - datak : terme ni de lcck
  - datac : datac du contact
  - vmax : [mx11 mx21]
  - ardc : du contact
  - sec : true si l'avatar accède aux secrets du couple
Retour:
A_SRV, '17-Avatar non trouvé'
A_SRV, '17-Avatar : données de comptabilité absentes'
*/
async function acceptRencontre (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.id)
  versions[j]++
  args.vav = versions[j] // version de l'avatar

  j = idx(args.idc)
  versions[j]++
  args.vc = versions[j] // version du couple
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(acceptRencontreTr)(cfg, args, rowItems)

  result.rowItems = rowItems
  syncListQueue.push({ sessionId: args.sessionId, dh, rowItems}) // à synchroniser
  setImmediate(() => { processQueue() })

  // Abonnements du compte
  session.plusCouples([args.idc])
  if (args.sec) session.plusCouples2([args.idc])
  session.plusCvs([args.idc])
  return result
}
m1fonctions.acceptRencontre = acceptRencontre

function acceptRencontreTr (cfg, args, rowItems) {
  if (args.phch) stmt(cfg, delcontact).run({ phch: args.phch }) // suppression du contact

  const a = stmt(cfg, selavatarId).get({ id: args.id })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  const compta = stmt(cfg, selcomptaId).get({ id: args.id })
  if (!compta) throw new AppExc(A_SRV, '17-Avatar : données de comptabilité absentes')
  const couple = stmt(cfg, selcoupleId).get({ id: args.idc })
  if (!couple) throw new AppExc(A_SRV, '17-Couple non trouvé')

  const compteurs = new Compteurs(compta.data)
  compta.v = args.vav
  compta.data = compteurs.calculauj().serial
  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))

  const m = a.lcck ? deserial(a.lcck) : null
  const map = m || {}
  map[args.ni] = args.datak
  a.v = args.vav
  a.lcck = serial(map)
  stmt(cfg, upd2avatar).run(a)
  rowItems.push(newItem('avatar', a))

  couple.v = args.vc
  couple.ardc = args.ardc
  couple.datac = args.datac
  decorCouple(couple)
  couple.stp = 4
  couple.st1 = args.sec ? 1 : 0
  setSt(couple)
  couple.mx11 = args.vmax[0]
  couple.mx21 = args.vmax[1]
  stmt(cfg, upd3couple).run(couple)
  rowItems.push(newItem('couple', couple))
}

/************************************************************
Refus d'une rencontre / parrainage
args :
  - sessionid
  - idc: id du couple
  - phch: id de phrase de contact
  - ardc : du contact
Retour:
A_SRV, '17-Couple non trouvé'
*/
async function refusRencontre (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idc)
  versions[j]++
  args.vc = versions[j] // version du couple
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(refusRencontreTr)(cfg, args, rowItems)

  result.rowItems = rowItems
  syncListQueue.push({ sessionId: args.sessionId, dh, rowItems}) // à synchroniser
  setImmediate(() => { processQueue() })

  // Abonnements du compte
  session.moinsCouples([args.idc])
  session.moinsCouples2([args.idc])
  return result
}
m1fonctions.refusRencontre = refusRencontre

function refusRencontreTr (cfg, args, rowItems) {
  if (args.phch) stmt(cfg, delcontact).run({ phch: args.phch }) // suppression du contact

  const couple = stmt(cfg, selcoupleId).get({ id: args.idc })
  if (!couple) throw new AppExc(A_SRV, '17-Couple non trouvé')

  couple.v = args.vc
  couple.ardc = args.ardc
  couple.phk0 = null
  decorCouple(couple)
  couple.stp = 3
  couple.st1 = 0
  setSt(couple)
  couple.mx11 = 0
  couple.mx21 = 0
  stmt(cfg, upd3couple).run(couple)
  rowItems.push(newItem('couple', couple))
}

/******************************************************************
Acceptation d'un parrainage
    sessionId: data.sessionId,
    clePubAv: kpav.publicKey, // clé publique de l'avatar créé
    rowCompte, // compte créé
    rowCompta, // compta du compte créé
    rowAvatar, // premier avatar du compte créé
    rowPrefs, // préférences du compte créé
    idCouple: couple.id, // id du couple
    phch: arg.phch, // hash de la phrase de contact
    idavp: couple.idE, // id de l'avatar parrain
    idt: nat.id, // id de la tribu de A1
    f1: datactc.forfaits[0],
    f2: datactc.forfaits[1],
    chkt,
    // nom complet du compte s'il est parrain, crypté par la clé de la tribu
    ncpart: arg.estPar ? ncpart : null, 
    ardc,
    estPar: arg.estpar,
    sec: arg.max[0] !== 0, // le filleul accède aux secrets du couple
    nrc: datactc.nrc,
    ck
Refus
    sessionId: data.sessionId,
    phch: arg.phch, // hash de la phrase de contact
    idCouple: couple.id, // id du couple
    ardc // ardoise du couple
Retour : sessionId, dh, si ok : rowItems : compte, compta, prefs, avatar, contactf
X_SRV, '03-Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
X_SRV, '04-Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
X_SRV, '18-Réserves de volume insuffisantes du parrain pour les forfaits attribués au compte filleul'
X_SRV, '18-Réserves de volume insuffisantes du parrain pour les réserves attribuées au compte filleul'
A_SRV, '17-Avatar parrain : données de comptabilité absentes'
A_SRV, '24-Couple non trouvé'
*/

const delcontact = 'DELETE FROM contact WHERE phch = @phch'
const updcompta = 'UPDATE compta SET v = @v, data = @data WHERE id = @id'
const upd2couple = 'UPDATE couple SET v = @v, phk0 = @phk0, st = @st, dlv = 0, ardc = @ardc WHERE id = @id'
const upd3couple = 'UPDATE couple SET v = @v, phk0 = @phk0, st = @st, dlv = 0, mx11 = @mx11, mx21 = @mx21, ardc = @ardc, datac = @datac WHERE id = @id'
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
  const cv = { id: avatar.id, v: 0, x: 0, dds: new DateJour().nbj - 14, cv: null, vsh: 0 }

  const versions = getValue(cfg, VERSIONS)

  let j = idx(args.idavp)
  versions[j]++
  args.vcp = versions[j] // version de compta parrain (L'AUTRE)

  j = idx(compte.id)
  versions[j]++
  compte.v = versions[j] // version du compte filleul (MOI)
  prefs.v = versions[j] // version de prefs filleul (MOI)
  avatar.v = versions[j] // version de l'avatar filleul (MOI)
  compta.v = versions[j] // version de compta filleul (MOI)

  j = idx(args.idCouple)
  versions[j]++
  args.vcouple = versions[j] // version du couple

  j = idx(args.idt)
  versions[j]++
  args.vtribu = versions[j] // version de la tribu

  versions[0]++
  cv.v = versions[0] // version de la carte de visite

  setValue(cfg, VERSIONS)

  const items = {} // contiendra après l'appel : comptaP (du parrain), couple

  cfg.db.transaction(acceptParrainageTr)(cfg, args, compte, compta, prefs, avatar, cv, items)

  const i1 = newItem('compte', compte)
  const i2 = newItem('avatar', avatar)
  const i3 = newItem('prefs', prefs)
  const i4 = newItem('compta', compta)
  const i5 = newItem('couple', items.couple)
  const i6 = newItem('chat', items.chat)
  const i7 = newItem('tribu', items.tribu)
  const tous = [i1, i2, i3, i4, i5, i6, i7]
  result.rowItems = tous // à retourner en résultat
  result.clepubc = clepubComptable(cfg)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: tous }) // à synchroniser
  setImmediate(() => { processQueue() })

  // Abonnements du nouveau compte
  session.compteId = compte.id
  session.plusAvatars([avatar.id])
  session.plusCouples([args.idCouple])
  if (args.sec) session.plusCouples2([args.idCouple])
  session.plusCvs([args.idavp])
  session.plusCvs([args.idCouple])
  session.plusCvs([avatar.id])
  return result
}
m1fonctions.acceptParrainage = acceptParrainage

const upd2tribu = 'UPDATE tribu SET v = @v, nbc = @nbc, f1 = @f1, f2 = @f2, r1 = @r1, r2 = @r2, mncpt = @mncpt WHERE id = @id'
  
function acceptParrainageTr (cfg, args, compte, compta, prefs, avatar, cv, items) {
  const c = stmt(cfg, selcompteDpbh).get({ dpbh: compte.dpbh })
  if (c) {
    if (c.pcbh === compte.pcbh) {
      throw new AppExc(X_SRV, '03-Phrase secrète probablement déjà utilisée. Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
    } else {
      throw new AppExc(X_SRV, '04-Une phrase secrète semblable est déjà utilisée. Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
    }
  }

  stmt(cfg, delcontact).run({ phch: args.phch }) // suppression du contact

  const tribu = stmt(cfg, seltribuId).get({ id: args.idt })
  if (!tribu) throw new AppExc(A_SRV, '17-Tribu non trouvéeabsentes')
  if (tribu.r1 < args.f1) throw new AppExc(X_SRV, '18-Réserves de volume V1 insuffisantes de la tribu pour affectation au nouveau compte')
  if (tribu.r2 < args.f2) throw new AppExc(X_SRV, '18-Réserves de volume V2 insuffisantes de la tribu pour affectation au nouveau compte')
  tribu.r1 -= args.f1
  tribu.r2 -= args.f2
  tribu.f1 += args.f1
  tribu.f2 += args.f2
  tribu.nbc += 1
  if (args.estPar) {
    const m = (tribu.mncpt ? deserial(tribu.mncpt) : null) || {}
    m[args.chkt] = args.ncpart
    tribu.mncpt = serial(m)
  }
  tribu.v = args.vtribu
  stmt(cfg, upd2tribu).run(tribu)
  items.tribu = tribu

  // Insertion des nouveaux compte, avatar, prefs du filleul
  stmt(cfg, inscompte).run(compte)
  stmt(cfg, insprefs).run(prefs)
  stmt(cfg, inscompta).run(compta)
  stmt(cfg, insavatar).run(avatar)
  stmt(cfg, inscv).run(cv)
  
  const chat = { id: compte.id, v: compte.v, dhde: 0, lua: 0, luc: 0, st: 0, nrc: args.nrc, ck: args.ck, items: null, vsh: 0 }
  stmt(cfg, inschat).run(chat)
  items.chat = chat

  // Clé RSA du filleul
  const avrsaAv = { id: avatar.id, clepub: args.clePubAv, vsh: 0 }
  stmt(cfg, insavrsa).run(avrsaAv)

  // MAJ du couple
  const cp = stmt(cfg, selcoupleId).get({ id: args.idCouple })
  if (!cp) throw new AppExc(A_SRV, '24-Couple non trouvé')
  cp.v = args.vcouple
  cp.phk0 = null
  decorCouple(cp)
  cp.stp = 4
  cp.st1 = args.sec ? 1 : 0
  setSt(cp)
  cp.ardc = args.ardc
  stmt(cfg, upd2couple).run(cp)
  items.couple = cp
  // signature du couple
  stmt(cfg, updddscv).run({ id: args.idCouple, dds: ddsAvatarGroupeCouple() })
}

/***************************************
row contact depuis la phrase de contact
*/
async function getContact (cfg, args) {
  try {
    const c = stmt(cfg, selcontactPhch).get({ phch: parseInt(args.phch) })
    if (!c) return { bytes: bytes0 }
    const clepubc = clepubComptable(cfg)
    const b = serial([c, clepubc])
    return { bytes: b }
  } catch (e) {
    console.log(e)
    return { bytes: bytes0 }
  }
}
m1fonctions.getContact = getContact

/***************************************
row couple depuis son id (obtenue dans la phhrase de rencontre / parraibage)
*/
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

  const cv = { id: groupe.id, v: 0, x: 0, dds: ddsAvatarGroupeCouple(), cv: null, vsh: 0 }
  versions[0]++
  cv.v = versions[0] // version de la cv du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(creationGroupeTr)(cfg, session, args, groupe, membre, cv, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  session.plusGroupes([groupe.id])
  session.plusCvs([groupe.id])
  return result
}
m1fonctions.creationGroupe = creationGroupe

function creationGroupeTr (cfg, session, args, groupe, membre, cv, rowItems) {
  const a = stmt(cfg, selavatarId).get({ id: args.ida })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  const m = a.lgrk ? deserial(a.lgrk) : null
  const map = m || {}
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

const selanimactifmembre = 'SELECT * FROM membre WHERE id = @id AND st >= 12 AND st <= 22 AND (st % 10) = 2'
const updvotemembre = 'UPDATE membre SET v = @v, vote = @vote WHERE id = @id AND im = @im'

function majBIGroupeTr (cfg, session, args, rowItems) {
  const g = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!g) throw new AppExc(A_SRV, '18-Groupe non trouvé')
  g.v = args.v
  const sty = g.st % 10
  g.st = sty + 20
  stmt(cfg, updstgroupe).run(g)
  rowItems.push(newItem('groupe', g))
  const rows = stmt(cfg, selanimactifmembre).all({ id: args.idg })
  for (const row of rows) {
    if (row.vote === 0) {
      row.v =args.v
      row.vote = 1
      stmt(cfg, updvotemembre).run(row)
      rowItems.push(newItem('membre', row))
    }
  }
}

/* Maj statut déblocage des invitations d'un groupe ****************************************
args :
- sessionId
- idg : id du groupe
- im : im
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
*/

async function majDBIGroupe (cfg, args) {
  const session = checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idg)
  versions[j]++
  args.v = versions[j] // version du groupe
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majDBIGroupeTr)(cfg, session, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems }) // à synchroniser
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majDBIGroupe = majDBIGroupe

const countvotemembre = 'SELECT COUNT(im) FROM membre WHERE id = @id AND st >= 12 AND st <= 22 AND (st % 10) = 2 AND vote = 1'

function majDBIGroupeTr (cfg, session, args, rowItems) {
  const g = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!g) throw new AppExc(A_SRV, '18-Groupe non trouvé')

  const m = stmt(cfg, selmembreIdIm).get({ id: args.idg, im: args.im })
  if (!m) return

  m.v =args.v
  m.vote = 0
  stmt(cfg, updvotemembre).run(m)
  rowItems.push(newItem('membre', m))

  const r = stmt(cfg, countvotemembre).get({ id: args.idg })
  if (r['COUNT(im)'] === 0) {
    g.v = args.v
    const sty = g.st % 10
    g.st = sty + 10
    stmt(cfg, updstgroupe).run(g)
    rowItems.push(newItem('groupe', g))
  }
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
- idh : id de l'avatar hébergeur
- idg : id du groupe
- imh : indice de l'avatar membre hébergeur
Retour: sessionId, dh
A_SRV, '10-Données de comptabilité absentes'
A_SRV, '18-Groupe non trouvé'
X_SRV, '22-Cet avatar n\'est pas l\'hébergeur actuel du groupe'
*/
async function finhebGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idh)
  versions[j]++
  args.vh = versions[j]
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
  const compta = stmt(cfg, selcomptaId).get({ id: args.idh })
  if (!compta) throw new AppExc(A_SRV, '10-Données de comptabilité absentes')
  const groupe = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!groupe) throw new AppExc(A_SRV, '18-Groupe non trouvé')

  if (groupe.imh !== args.imh)
    throw new AppExc(X_SRV, '22-Cet avatar n\'est pas l\'hébergeur actuel du groupe')

  compta.v = args.vh
  const compteurs = new Compteurs(compta.data)
  compteurs.setV1(-groupe.v1)
  compteurs.setV2(-groupe.v2)
  compta.data = compteurs.serial
  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))

  groupe.v = args.vg
  groupe.imh = 0
  groupe.dfh = new DateJour().nbj
  stmt(cfg, updhebgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))
}

/* Début d'hébergement d'un groupe ****************************************
args :
- sessionId
- idg : du groupe,
- idh : de l'avatar hébergeur
- imh : indice de l'avatar membre hébergeur
Retour: sessionId, dh
A_SRV, '10-Données de comptabilité absentes'
A_SRV, '18-Groupe non trouvé'
X_SRV, '20-Groupe encore hébergé : un nouvel hébergeur ne peut se proposer que si le groupe n\'a plus d'avatar hébergeur'
X_SRV, '21-Limite de volume (' + f + ') insuffisante pour héberger le volume actuel groupe.'
*/
async function debhebGroupe (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idh)
  versions[j]++
  args.vh = versions[j]
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
  const compta = stmt(cfg, selcomptaId).get({ id: args.idh })
  if (!compta) throw new AppExc(A_SRV, '10-Données de comptabilité de l\'hébergeur absentes')
  const groupe = stmt(cfg, selgroupeId).get({ id: args.idg })
  if (!groupe) throw new AppExc(A_SRV, '18-Groupe non trouvé')

  if (groupe.imh) throw new AppExc(X_SRV, '20-Groupe encore hébergé : un nouvel hébergeur ne peut se proposer que si le groupe n\'a plus de compte hébergeur')

  compta.v = args.vh
  const compteurs = new Compteurs(compta.data)
  const ok1 = compteurs.setV1(groupe.v1)
  const ok2 = compteurs.setV2(groupe.v2)
  if (!ok1 || !ok2) {
    const f = !ok1 && ok2 ? 'V1' : (ok1 && !ok2 ? 'V2' : 'V1 et V2')
    throw new AppExc(X_SRV, '21-Limite de volume (' + f + ') insuffisante pour héberger le volume actuel groupe.')
  }

  compta.data = compteurs.serial
  stmt(cfg, updcompta).run(compta)
  rowItems.push(newItem('compta', compta))

  groupe.v = args.vg
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
A_SRV, '22-Groupe hébergé par un autre avatar'
X_SRV, '21-Limite de volume (' + f + ') insuffisante pour héberger le groupe avec son volume actuel.'
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
    throw new AppExc(X_SRV, '22-Groupe hébergé par un autre avatar')

  const ok1 = args.forfaits[0] > (groupe.v1 * UNITEV1)
  const ok2 = args.forfaits[1] > (groupe.v2 * UNITEV2)
  if (!ok1 || !ok2) {
    const f = !ok1 && ok2 ? 'V1' : (ok1 && !ok2 ? 'V2' : 'V1 et V2')
    throw new AppExc(X_SRV, '21-Limite de volume (' + f + ') insuffisante pour héberger le groupe avec son volume actuel.')
  }
  
  groupe.v = args.vg
  groupe.f1 = args.forfaits[0]
  groupe.f2 = args.forfaits[1]
  stmt(cfg, updvmaxgroupe).run(groupe)
  rowItems.push(newItem('groupe', groupe))
}

/* Maj du statut LAA d'un membre d'un groupe ****************************************
args :
- sessionId
- idg : du groupe,
- im : de l'avatar membre
- laa: 0 1 2
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
A_SRV, '19-Membre non trouvé'
*/
async function majLAAMembre (cfg, args) {
  checkSession(args.sessionId)
  const dh = getdhc()
  const result = { sessionId: args.sessionId, dh: dh }

  const versions = getValue(cfg, VERSIONS)
  const j = idx(args.idg)
  versions[j]++
  args.vg = versions[j]
  setValue(cfg, VERSIONS)

  const rowItems = []
  cfg.db.transaction(majLAAMembreTr)(cfg, args, rowItems)

  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  return result
}
m1fonctions.majLAAMembre = majLAAMembre

function majLAAMembreTr (cfg, args, rowItems) {
  const m = stmt(cfg, selmembreIdIm).get({ id: args.idg, im: args.im })
  if (!m) throw new AppExc(A_SRV, '19-Membre non trouvé')

  m.v = args.vg
  const stx = Math.floor(m.st / 10)
  m.st = (stx * 10) + args.laa
  stmt(cfg, updstmembre).run(m)
  rowItems.push(newItem('membre', m))
}

/* Contact d'un groupe ****************************************
args :
- sessionId
- mxim
- rowMembre
Retour: sessionId, dh
A_SRV, '18-Groupe non trouvé'
*/
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

const updmximgroupe = 'UPDATE groupe SET mxim = @mxim WHERE id = @id'

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
A_SRV, '17-Avatar non trouvé'
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
  if (args.purgefic) await cfg.storage.delACP(cfg.code, args.id)
  return result
}
m1fonctions.refusInvitGroupe = refusInvitGroupe

function refusInvitGroupeTr (cfg, args, rowItems) {
  const membre = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!membre) throw new AppExc(A_SRV, '19-Membre non trouvé')
  const a = stmt(cfg, selavatarId).get({ id: args.ida })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  
  const nb = nbmembresactifsinvitesTr (cfg, args.id)

  if (nb === 1) {
    // destruction du groupe - dernier mebre actif / invité
    purgegroupeTr(cfg, args.id)
    args.purgefic = true
  } else {
    // simple maj du statut, il reste d'autres membres actifs / invités
    membre.v = args.vg
    const stp = membre.st % 10
    membre.st = 30 + stp
    stmt(cfg, updstmembre).run(membre)
    rowItems.push(newItem('membre', membre))
  }

  const m = a.lgrk ? deserial(a.lgrk) : null
  const map = m || {}
  if (!map[args.ni]) return // déjà fait
  delete map[args.ni]
  a.v = args.va
  a.lgrk = serial(map)
  stmt(cfg, upd1avatar).run(a)
  rowItems.push(newItem('avatar', a))
}

/* Résilier un membre d'un groupe ****************************************
args :
- sessionId
- id, im : id du membre
- ida: id de l'avatar
- ni: numéro d'invitation au groupe
Retour: sessionId, dh
A_SRV, '19-Membre non trouvé
A_SRV, '17-Avatar non trouvé'
*/
async function resilierMembreGroupe (cfg, args) {
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
  cfg.db.transaction(resilierMembreGroupeTr)(cfg, args, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })
  if (args.purgefic) await cfg.storage.delACP(cfg.code, args.id)
  return result
}
m1fonctions.resilierMembreGroupe = resilierMembreGroupe

function resilierMembreGroupeTr (cfg, args, rowItems) {
  const membre = stmt(cfg, selmembreIdIm).get({ id: args.id, im: args.im })
  if (!membre) throw new AppExc(A_SRV, '19-Membre non trouvé')
  const a = stmt(cfg, selavatarId).get({ id: args.ida })
  if (!a) throw new AppExc(A_SRV, '17-Avatar non trouvé')
  
  const nb = nbmembresactifsinvitesTr (cfg, args.id)

  if (nb === 1) {
    // destruction du groupe - dernier mebre actif / invité
    purgegroupeTr(cfg, args.id)
    args.purgefic = true
  } else {
    // simple maj du statut, il reste d'autres membres actifs / invités
    membre.v = args.vg
    const stp = membre.st % 10
    let stx = Math.floor(membre.st / 10)
    if (stx < 2) {
      stx = 0
    } else if (stx === 2) {
      stx = 4
    }
    membre.st = (stx * 10) + stp
    stmt(cfg, updstmembre).run(membre)
    rowItems.push(newItem('membre', membre))
  }
  stmt(cfg, delinvitgr).run({ id: args.ida, ni: args.ni })
  
  const m = a.lgrk ? deserial(a.lgrk) : null
  const map = m || {}
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

const updmfassecret = 'UPDATE secret SET v = @v, v2 = @v2, mfas = @mfas WHERE id = @id AND ns = @ns'
const deltrecIdIdf = 'DELETE FROM trec WHERE id = @id AND idf = @idf'

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
  await cfg.storage.delFiles(cfg.code, args.id, [args.idf])
  return result
}
m1fonctions.supprFichier = supprFichier

function supprFichierTr (cfg, args, rowItems) {
  const secret = stmt(cfg, selsecretIdNs).get({ id: args.id, ns: args.ns })
  if (!secret) throw new AppExc(A_SRV, '25-Secret non trouvé')
  const map = secret.mfas ? deserial(secret.mfas) : {}
  const e = map[args.idf]
  if (!e) return // déjà supprimé !
  const dv2 = - e[0]
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
    idc: parseInt(args.ida),
    idf: parseInt(args.idf)
  }
  volumes(cfg, a)
  const rowItems = []
  cfg.db.transaction(volumesTr)(cfg, a, rowItems)
  syncListQueue.push({ sessionId: args.sessionId, dh: dh, rowItems: rowItems })
  setImmediate(() => { processQueue() })    
  const url = await cfg.storage.getUrl(cfg.code, a.id, a.idf)
  return { type: 'text/plain', bytes: url }
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
- idc : identifiant de l'avatar sur qui imputer: perso, perso-1, hébergeur
- idc2 : identifiant du second avatar pour un secret de couple. Est null si le couple est solo.
  Le "premier" avatar est celui de l'auteur du secret.
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
  c51: '51-Forfait personnel dépassé pour le volume V1',
  c52: '52-Forfait personnel dépassé pour le volume V2',
  c53: '53-Forfait du conjoint dépassé pour le volume V1',
  c54: '54-Forfait du conjoint dépassé pour le volume V2',
  c55: '55-Forfait de l\'hébergeur du groupe dépassé pour le volume V1',
  c56: '56-Forfait de l\'hébergeur du groupe dépassé pour le volume V2',
  c61: '61-Maximum de volume V1 du couple dépassé',
  c62: '62-Maximum de volume V2 du couple dépassé',
  c65: '65-Maximum de volume V1 du groupe dépassé (attribué par le compte hébergeur du groupe)',
  c66: '66-Maximum de volume V2 du couple dépassé (attribué par le compte hébergeur du groupe)'
}

function volumes (cfg, args) {
  const versions = getValue(cfg, VERSIONS)
  let j = idx(args.idc)
  versions[j]++
  args.vc = versions[j]
  if (args.idc2) {
    j = idx(args.idc2)
    versions[j]++
    args.vc2 = versions[j]
  }
  if (args.ts === 0) {
    args.vs = versions[j] // version du secret personnel
  } else {
    j = idx(args.id) // version du secret de couple ou groupe
    versions[j]++
    args.vs = versions[j]
    setValue(cfg, VERSIONS)
  }
}

function volumesTr (cfg, args, rowItems, simul) {
  // simul : si true n'enregistre PAS les volumes mais les exceptions sont levées comme si
  if (args.ts === 1 && args.idc === 0) throw new AppExc(A_SRV, '40-Contact sans partage de secret')
  if (args.ts === 2 && args.idc === 0) throw new AppExc(A_SRV, '40-Groupe non hébergé')

  const c = stmt(cfg, selcomptaId).get({ id: args.idc })
  if (!c) throw new AppExc(A_SRV, '40-Comptabilité de l\'avatar principal non trouvée')
  const c2 = args.idc2 ? stmt(cfg, selcomptaId).get({ id: args.idc2 }) : null
  if (args.idc2 && !c2) throw new AppExc(A_SRV, '41-Comptabilité de l\'avatar conjoint non trouvée')
  const cp = args.ts === 1 ? stmt(cfg, selcoupleId).get({ id: args.id }) : null
  if (args.ts === 1 && !cp) throw new AppExc(A_SRV, '42-Couple non trouvé')
  if (cp) decorCouple(cp)
  const gr = args.ts === 2 ? stmt(cfg, selgroupeId).get({ id: args.id }) : null
  if (args.ts === 2 && !gr) throw new AppExc(A_SRV, '43-Groupe non trouvé')

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

  function min (a, b) { return a > b ? b : a }

  function f2 (simul) {
    {
      const dm = cp.v1 + args.dv1
      let mx = 0
      if (cp.st0 === 1 && cp.st1 === 1) {
        mx = min(cp.mx10, cp.mx11) * UNITEV1
      } else if (cp.st0 === 1) {
        mx = cp.mx10 * UNITEV1
      } else if (cp.st1 === 1) {
        mx = cp.mx11 * UNITEV1
      }
      if (dm > mx) {
        const m = ervol.c61 + ` [demande: ${dm} / maximum: ${mx}]`
        if (args.dv1 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
      }
    }
    {
      const dm = cp.v2 + args.dv2
      let mx = 0
      if (cp.st0 === 1 && cp.st1 === 1) {
        mx = min(cp.mx20, cp.mx21) * UNITEV1
      } else if (cp.st0 === 1) {
        mx = cp.mx20 * UNITEV1
      } else if (cp.st1 === 1) {
        mx = cp.mx21 * UNITEV1
      }
      if (dm > mx) {
        const m = ervol.c62 + ` [demande: ${dm} / maximum: ${mx}]`
        if (args.dv2 > 0) throw new AppExc(X_SRV, m); else info.push(m)  
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
    if (args.idc2) { // on n'impute pas vt au compte 2
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

function nbmembresactifsinvitesTr (cfg, idg) {
  const r = stmt(cfg, selactifsmembre).get({ id: idg })
  return r['COUNT(im)']
}

const delmembre = 'DELETE FROM membre WHERE id = @id'
const delgroupe = 'DELETE FROM groupe WHERE id = @id'
const delsecret = 'DELETE FROM secret WHERE id = @id'

function purgegroupeTr (cfg, idg) {
  stmt(cfg, delmembre).run({ id: idg })
  stmt(cfg, delgroupe).run({ id: idg })
  stmt(cfg, delsecret).run({ id: idg })
}
