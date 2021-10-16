const crypt = require('./crypto.js')
const getSession = require('./session.js').getSession
const now = require('nano-time')
const avro = require('avsc')
const api = require('./api.js')
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
    cfg : configuration relative au code de l'organisation    
    args : objet des arguments
    Retourne un objet result :
    Pour un GET :
        result.type : type mime
        result.bytes : si le résultat est du binaire
    Pour un POST :
        result : objet résultat
    En cas d'erreur :
        result.erreur : objet erreur {c:99 , m:"...message...", d:"...detail..." s:" stack trace "}
*****************************************************************/

async function echo (cfg, args, isGet) {
    if (!args) args = { a: 1, b: 'toto' }
    args.org = cfg.code || 'org'
    return !isGet ? args : { type:"text/plain", bytes:Buffer.from(JSON.stringify(args), 'utf8') }
}
exports.echo = echo

async function erreur (cfg, args) {
    return { erreur: args, org:cfg.code }
}
exports.erreur = erreur

function decryptDatax(cle, datax) {
    const x = crypt.decrypter(cle, Buffer.from(datax, 'base64'))
    const y = x.toString('utf8')
    return JSON.parse(y)
}

function cryptDatax(cle, datax) {
    const j = JSON.stringify(datax)
    return [j, base64url(crypt.crypter(cle, Buffer.from(j, 'utf8')))]
}

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
const selidcompteid = 'SELECT id FROM compte WHERE id = @id'
const selidcomptedpbh = 'SELECT id FROM compte WHERE dpbh = @dpbh'
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
        return { erreur: { c: 1 , m: 'Mot de passe de l\'organisation non reconnu', d: 'Pour créer un compte privilégié, le mot de passe de l\'organisation est requis' } }
    }
    const session = getSession(args.sessionId)
    const compte = rowTypes.rowSchemas.compte.fromBuffer(args.rowCompte)
    const avatar = rowTypes.rowSchemas.avatar.fromBuffer(args.rowAvatar)

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
    result.rows = [compte, avatar]
    try {
        cfg.db.transaction(creationCompteTr)(cfg, session, compte, avatar, avrsa, avgrvq)
        return result
    } catch (e) {
        return e
    }
}
exports.creationCompte = creationCompte

function creationCompteTr (cfg, session, compte, avatar, avrsa, avgrvq) {
    const c = stmt(cfg, selcomptedpbh).get({ dpbh: compte.dpbh })
    if (c) {
        if (c.pcbh === compte.pcbh) {
            throw { erreur: { f: true, c: 2, m: 'Phrase secrète probablement déjà utilisée', d: 'Vérifier que le compte n\'existe pas déjà en essayant de s\'y connecter avec la phrase secrète' } }
        } else {
            throw { erreur: { f: true, c: 3, m: 'Une phrase secrète semblable est déjà utilisée', d: 'Changer a minima la première ligne de la phrase secrète pour ce nouveau compte' } }
        }
    }
    stmt(cfg, inscompte).run({ ...compte })
    //const x = compte
    // const y = { id:x.id, v:x.v, dds:x.dds, dpbh:x.dpbh, pcbh:x.pcbh, kx:x.kx, mack:x.mack, mmck:x.mmck}
    //const y = { ...compte }
    //st.run(y)
    stmt(cfg, insavatar).run({ ...avatar })
    stmt(cfg, insavrsa).run(avrsa)
    stmt(cfg, insavgrvq).run(avgrvq)
    session.setCompteId(compte.id)
    session.setAvatarId(avatar.id)
    session.setCvId(avatar.id)
}

/*
function crcompteavatar (cfg, arg1, arg2) {
    stmt(cfg, inscompte).run(arg1)
    stmt(cfg, insavatar).run(arg2)
}

Détermine si une connexion ou création est possible avec cette phrase secrète
args = { dpbh, pcbsh }
Retours = status ...
0: phrase secrète non reconnue
1: compte identifié. { status:1, id:id du compte, k:clé k, avatars:[noms longs des avatars] }
2: création de compte privilégié possible. { status:2 }
3: création de compte standard possible. { status:3, cext:cext du parrain }
*/
async function testconnexion (cfg, args) {
    const dh = getdhc()
    const sessionId = args.sessionId
    if (cfg.cle === args.pcbsh) {
        return { status: 2, dh: dh, sessionId: sessionId, rows: []}
    }
/*
    let row = stmt(cfg, selcomptedpbh).get(args)
    if (row) {
        const data = JSON.parse(row.data)
        if (data.pbcs !== args.pcbs){
            return { status: 0 }
        }
        const datax = decryptDatax(args.clex, row.datax)
        return { status:1, id: row.id, k: datax.k, avatars: datax.avatars }
    }

    row = stmt(cfg, selcextdpbh).get(args)
    if (row) {
        if (row.pbcs !== args.pcbs){
            return { status: 0 }
        }
        const datax = decryptDatax(args.clex, row.datax)
        return { status:3, id: row.id, dlv: row.dlv, datax: datax }
    }
*/
    return { status: 0, dh: dh, sessionId: sessionId, rows: [] }
}
exports.testconnexion = testconnexion

/*
nouveau compte privilégié
mdp : SHA du BCRYPT de la phrase secrète de l'organisation
id dpbh clex pcbs k nla (nom long du premier avatar)
*/
function nouvcomptepriv (cfg, args) {
    if (cfg.cle !== args.mdp64) {
        return { c: 1 , m: 'Mot de passe l\'organisation non reconnu', d: 'Pour créer un compte privilégié, le mot de passe de l\'organisation est requis' }
    }

    let row = stmt(cfg, selidcompteid).get(args)
    if (row) {
        return { c: 2 , m: 'Compte déjà existant', d: 'Cet identifiant est déjà celui d\'un compte existant.' }
    }
    row = stmt(cfg, selidcomptedpbh).get(args);
    if (row) {
        return { c: 3 , m: 'Compte déjà enregistré avec la même première ligne de la phrase secrète', d: 'Ces doublons sont interdits par sécurité' }
    }

    const q = cfg.quotas
    const data = { pcbs: args.pcbs, q1: q[0] * MO, q2: q[1] * MO, qm1: q[2] * MO, qm2: q[3] * MO, vdm1: 0, vdm2: 0 }
    const cleav = sha256(Buffer.from(args.nla))
    const idav = hash(base64url(cleav))
    const [datac, datax] = cryptDatax(clex, { k: args.k, mc: [], avatars: [nla] })
    const dhc = getdhc()
    const dma = getdma()
    const arg1 = { table:'compte', id:args.id, dhc:dhc, dma:dma, dpbh:args.dpbh, data:data, datax:datax, datac: datac }

    const data2 = { v1: 0, v2:0, vm1: 0, vm2: 0, qr1: 0, qr2: 0 }
    const [data2c, data2x] = cryptDatax(cleav, { photo: '', info: '' })   
    const arg2 = { table:'avatar', id:idav, dhccv:dhc, dma:dma, data:data2, datax:data2x, datac:data2c }

    cfg.db.transaction(crcompteavatar)(cfg, arg1, arg2)
    
    Session.syncSessions([arg1, arg2], [])

    return { ok: true }

}
exports.nouvcomptepriv = nouvcomptepriv