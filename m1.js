const crypt = require('./crypto.js')
const getSession = require('./session.js').getSession
const now = require('nano-time')
const avro = require('avsc')
const api = require('./api.js')
const AppExc = require('./api.js').AppExc
const rowTypes = require('./rowTypes.js')

const ETAT = 0
const VERSIONS = 1

const dev = process.env.NODE_ENV === "development"
const MO = 1024 * 1024
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
function atStart(cfg) {
    console.log("m1 start")
}
exports.atStart = atStart

/***************************************************************
Appel de l'opération
    cfg : configuration relative au code de l'organisation    
    args : objet des arguments
Retourne un objet result :
Pour un GET :
    result.type : type mime
    result.bytes : si le résultat est du binaire
Pour un POST :
    OK : result : objet résultat à sérialiser - HTTP status 200

Exception : 
    AppExc : AppExc sérialisé en JSON
        code > 0 - erreur fonctionnelle à retourner par l'application
            HTTP status 400
        code < 0 - erreur fonctionnelle à émettre en exception à l'application
            HTTP status 401                   
    Inattendue : Création d'un AppExc avec code < 0 sérialisé en JSON
        HTTP status 402
*****************************************************************/

async function echo (cfg, args, isGet) {
    if (args.to) {
        await sleep(args.to * 1000)
    }
    if (!args) args = { a: 1, b: 'toto' }
    args.org = cfg.code || 'org'
    return !isGet ? args : { type:"text/plain", bytes:Buffer.from(JSON.stringify(args), 'utf8') }
}
exports.echo = echo

async function erreur (cfg, args) {
    if (args.to) {
        await sleep(args.to * 1000)
    }
    throw new AppExc(args.code, args.message, args.detail)
}
exports.erreur = erreur

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
    let res = stmt(cfg, selvalues).get({ id: n })
    let bin = res ? res.v : null
    if (bin) {
        value = t.type === 'json' ? 
            JSON.parse(Buffer.from(bin).toString()) : 
            t.type.fromBuffer(bin)
    } else {
        value = t.defaut
        bin = t.type === 'json' ? 
            Buffer.from(value) : 
            t.type.toBuffer(value)
        stmt(cfg, insvalues).run({ id: n, v: bin })
    }
    cache[n] = value
    return value
}

function setValue (cfg, n) {
    const t = valueTypes[n]
    const value = cacheValues[cfg.code][n]
    bin = t.type === 'json' ? 
        Buffer.from(value) : 
        t.type.toBuffer(value)
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
    const result = { status: 0, sessionId: args.sessionId, dh: getdhc() }
    if (cfg.cle !== args.mdp64) {
        throw new AppExc(11, 'Mot de passe de l\'organisation non reconnu', 'Pour créer un compte privilégié, le mot de passe de l\'organisation est requis')
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
            throw new AppExc(12, 'Phrase secrète probablement déjà utilisée', 'Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète')
        } else {
            throw new AppExc(13, 'Une phrase secrète semblable est déjà utilisée', 'Changer a minima la première ligne de la phrase secrète pour ce nouveau compte')
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

/*
Détermine si les hash de la phrase secrète en argument correspond à un compte.
args = { dpbh, pcbh }
Retour = compte
*/
async function connexionCompte (cfg, args) {
    const result = { status: 0, sessionId: args.sessionId, dh: getdhc() }
    const session = getSession(args.sessionId)
    const c = stmt(cfg, selcomptedpbh).get({ dpbh: args.dpbh })
    if (!c || (c.pcbh !== args.pcbh)) {
        throw new AppExc(10, 'Compte non authentifié', 'Aucun compte n\est déclaré avec cette phrase secrète')
    }
    const it = rowTypes.newItem('compte', c)
    // const it2 = rowTypes.deserialItem(it)
    result.rowItems = [ it ]
    return result
}
exports.connexionCompte = connexionCompte

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
