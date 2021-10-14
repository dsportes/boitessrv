const crypt = require('./crypto.js')
const Session = require('./session.js')
const now = require('nano-time')
const avro = require('avsc')

const ETAT = 0
const VERSIONS = 1

const dev = process.env.NODE_ENV === "development"
const MO = 1024 * 1024
const nbVersions = 100
const defautVersions = new Array(nbVersions)
for (let i = 0; i < nbVersions; i++) { defautVersions[i] = 0 }

const valueTypes = {
  0: { type: avro.Type.forSchema({ type: 'array', items: 'string' }), defaut: '{}' },
  1: { type: avro.Type.forSchema({ type: 'array', items: 'int' }), defaut: defautVersions }
}

/*
Initialisation du module APRES que le serveur ait été créé et soit opérationnel
Rafraîchissement périodique en cache (si demandé et seulement pour la production) de la liste des aricles à peser
afin que les balances aient plus rapidement la réponse en cas de changement dans Odoo
*/
function atStart(cfg) {
    console.log("m1 start")
    const options = { fileMustExist: true, verbose: console.log }
    for(let org in cfg.orgs) {
        const e = cfg.orgs[org]
        e.db = require('better-sqlite3')('./databases/' + org + '.db3', options);
      for (const id in valueTypes) {
        dbGetValue(e, parseInt(id, 10))
      }
    }
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

function getdma () {
    const d = new Date()
    const an = d.getUTCFullYear() % 100
    const mo = d.getUTCMonth()
    return ( (an * 12) + mo)
}

/******************************************/
const selvalues = 'SELECT v FROM values WHERE id = @id'
const insvalues = 'INSERT INTO (id, v) values (@id, @v)'
const updvalues = 'UPDATE values SET v = @v WHERE id = @id'

function dbGetValue (cfg, n) {
  const t = valueTypes[n]
  let bin = stmt(cfg, selvalues).run({ id: n })
  if (bin) return t.type.fromBuffer(bin)
  bin = t.type.toBuffer(t.defaut)
  stmt(cfg, insvalues).run({ id: n, v: bin })
  return t.type.defaut
}

function dbPutValue (cfg, n, value) {
  const t = valueTypes[n]
  const bin = t.type.toBuffer(value)
  stmt(cfg, updvalues).run({ id: n, v: bin })
}

/******************************************/
const cachestmt = { }

function stmt (cfg, sql) {
    const c = cachestmt[cfg.code]
    if (!c) { c = {}; cachestmt[cfg.code] = c }
    if (!c[sql]) c[sql] = cfg.db.prepare(sql)
    return c[sql]
}
/******************************************/
const inscompte = 'INSERT INTO compte (id, dhc, dma, dpbh, data, datax) VALUES (@id, @dhc, @dma, @dbph, @data, @datax)'
const insavatar = 'INSERT INTO avatar (id, dhccv, dma, data, datax) VALUES (@id, @dhcv, @dma, @data, @dataa)'
const selidcompteid = 'SELECT id FROM compte WHERE id = @id'
const selidcomptedpbh = 'SELECT id FROM compte WHERE dpbh = @dpbh'
const selcomptedpbh = 'SELECT * FROM compte WHERE dpbh = @dpbh'
const selcextdpbh = 'SELECT * FROM cext WHERE dpbh = @dpbh'

function crcompteavatar (cfg, arg1, arg2) {
    stmt(cfg, inscompte).run(arg1)
    stmt(cfg, insavatar).run(arg2)
}
/*******************************************/

/*
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
    if (cfg.cle !== args.mdp) {
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