const crypto = require('crypto')

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
        result.error : objet erreur {c:99 , m:"...", s:" trace "}
*****************************************************************/

async function echo (org, args, isGet) {
    if (!args) args = { }
    args.org = org
    return !isGet ? args : {type:"text/plain", bytes:Buffer.from(JSON.stringify(args), 'utf8')}
}
exports.echo = echo

async function erreur (org, args) {
    return { erreur: args, org:org }
}
exports.erreur = erreur
