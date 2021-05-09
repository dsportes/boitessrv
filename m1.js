const crypt = require('./crypto.js')

const dev = process.env.NODE_ENV === "development"

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
    org : code de l'organisation    
    args : objet des arguments
    Retourne un objet result :
    Pour un GET :
        result.type : type mime
        result.bytes : si le résultat est du binaire (ume image ...)
    Pour un POST :
        result : objet résultat
    En cas d'erreur :
        result.erreur : objet erreur {c:99 , m:"...message...", d:"...detail..." s:" stack trace "}
*****************************************************************/

async function echo (cfgorg, args, isGet) {
    if (!args) args = { }
    args.org = cfgorg.code
    return !isGet ? args : {type:"text/plain", bytes:Buffer.from(JSON.stringify(args), 'utf8')}
}
exports.echo = echo

async function erreur (cfgorg, args) {
    return { erreur: args, org:cfgorg.code }
}
exports.erreur = erreur

function decryptDatax(cle, datax) {
    const x = crypt.decrypter(cle, Buffer.from(datax, 'base64'))
    const y = x.toString('utf8')
    return JSON.parse(y)
}

function cryptDatax(cle, datax) {
    return base64url(crypt.decrypter(cle, Buffer.from(JSON.stringify(datax), 'utf8')))
}

function getdhc() {
    const hrTime = process.hrtime()
    return (hrTime[0] * 1000000) + (hrTime[1] / 1000)
}

function getdma () {
    const d = new Date()
    const an = d.getUTCFullYear() % 100
    const mo = d.getUTCMonth()
    return ( (an * 12) + mo)
}

const MO = 1024 * 1024

/*
Détermine si une connexion ou création est possible avec cette phrase secrète
args = { dpbh, clex, pcbs: base64url(sha256(clex)) }
Retours = status ...
0: phrase secrète non reconnue
1: compte identifié. { status:1, id:id du compte, k:clé k, avatars:[noms longs des avatars] }
2: création de compte privilégié possible. { status:2 }
3: création de compte standard possible. { status:3, cext:cext du parrain }
*/
async function testconnexion (cfgorg, args) {
    if (cfgorg.cle === args.pcbs) {
        return { status: 2 }
    }

    const row = cfgorg.db.prepare('SELECT id, dma, data, datax FROM compte WHERE dpbh = ?').get('args.dpbh');
    if (row) {
        const data = JSON.parse(row.data)
        if (data.pbcs !== args.pcbs){
            return { status: 0 }
        }
        const datax = decryptDatax(args.clex, row.datax)
        return { status:1, id: row.id, k: datax.k, avatars: datax.avatars }
    }

    const row2 = cfgorg.db.prepare('SELECT id, dlv, data, datax FROM cext WHERE dpbh = ?').get('args.dpbh');
    if (row2) {
        if (row2.pbcs !== args.pcbs){
            return { status: 0 }
        }
        const datax = decryptDatax(args.clex, row2.datax)
        return { status:3, id: row2.id, dlv: row2.dlv, datax: datax }
    }

    return { status: 0 }
}
exports.testconnexion = testconnexion

/*
nouveau compte privilégié
mdp : SHA du BCRYPT de la phrase secrète de l'organisation
id dpbh clex pcbs k nla (nom long du premier avatar)
*/
function nouvcomptepriv (cfgorg, args) {
    if (cfgorg.cle !== args.mdp) {
        return { c: 1 , m: 'Mot de passe l\'organisation non reconnu', d: 'Pour créer un compte privilégié, le mot de passe de l\'organisation est requis' }
    }

    const row = cfgorg.db.prepare('SELECT id FROM compte WHERE id = ?').get('args.id');
    if (row) {
        return { c: 2 , m: 'Compte déjà existant', d: 'Cet identifiant est déjà celui d\'un compte existant.' }
    }
    const row = cfgorg.db.prepare('SELECT id FROM compte WHERE dpbh = ?').get('args.dpbh');
    if (row) {
        return { c: 3 , m: 'Compte déjà enregistré avec la même première ligne de la phrase secrète', d: 'Ces doublons sont interdits par sécurité' }
    }
    const data = { pcbs: args.pcbs, q1: 10 * MO, q2: 100 * MO, qm1: 10 * MO, qm2: 100 *MO, vdm1: 0, vdm2: 0 }
    const cleav = sha256(Buffer.from(args.nla))
    const idav = hash(base64url(cleav))
    const datax = cryptDatax(clex, { k: args.k, mc: [], avatars: [nla] })
    const dhc = getdhc()
    const dma = getdma()
    const data2 = { v1: 0, v2:0, vm1: 0, vm2: 0, qr1: 0, qr2: 0 }
    const dataa = cryptDatax(cleav, { photo: '', info: '' })

    const insert1 = cfgorg.db.prepare('INSERT INTO compte (id, dhc, dma, dpbh, data, datax) VALUES (@name, @age)')
    const arg1 = { id:args.id, dhc:dhc, dma:dma, dpbh:args.dpbh, data:data, datax:datax }
    const insert2 = cfgorg.db.prepare('INSERT INTO avatar (id, dhccv, dma, data, datax) VALUES (@name, @age)')
    const arg2 = { id:idav, dhccv:dhc, dma:dma, data:data2, dataa:dataa }

    const tr = cfgorg.db.transaction((arg1, arg2) => {
        insert1.run(arg1)
        insert2.run(arg2)
    })

    return { ok: true }

}
exports.nouvcomptepriv = nouvcomptepriv