const fs = require("fs");
const http = require("http");
const https = require("https");
const express = require('express');

const modules = {}
modules.m1 = require("./m1.js")

const dev = process.env.NODE_ENV === "development"
console.log("server.js : chargement")

/* 
vérification que l'origine appartient à la liste des origines autorisées (q'il y en a une)
localhost passe toujours
*/
function checkOrigin(req) {
    if (!cfg.origins || !cfg.origins.length) return true
    let origin = req.headers["origin"]
    if (!origin || origin == "null") {
        const referer = req.headers["referer"];
        if (referer) {
            let i = referer.indexOf("/", 10);
            if (i != -1)
                origin = referer.substring(0, i);
        }
    }
    if (!origin || origin == "null")
        origin = req.headers["host"];
    if (origin && origin.startsWith("http://localhost"))
        origin = "localhost"

    return origin && cfg.origins.indexOf(origin) !== -1
}

// positionne les headers et le status d'une réponse. Permet d'accepter des requêtes cross origin des browsers
function setRes(res, status) {
    return res.status(status).set({
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Methods" : "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With"
    })
}

function er(c) {
    const l = [
        "Erreur non récupérée : ", // 0
        "Origine non autorisée", // 1
        "Module inconnu", // 2
        "Fonction inconnue", // 3
        "Organisation inconnue", // 4
    ]
    return {c: c, m: l[c]}
}

/*
Traitement générique d'une opération
Status HTTP de retour :
-200 : OK pas d'erreur, ni technique ni fonctionnelle
-400 : erreur fonctionnelle
-401 : exception non trappée, bug ou problème technique
*/
async function operation(req, res) {
    let pfx = new Date().toISOString() // prefix de log
    try {
        let isGet = req.method === "GET"
        // vérification de l'origine de la requête
        if (!checkOrigin(req)) {
            setRes(res, 400).json(er(1))
            return
        }
        // récupération du module traitant l'opération
        const mod = modules[req.params.mod]
        if (!mod) {
            setRes(res, 400).json(er(2))
            return
        }
        // récupétration de la fonction de ce module traitant l'opération
        const f = req.params.func
        const func = mod[f]
        if (!func) {
            setRes(res, 400).json(er(3))
            return
        }
        // reconnaissance de l'organisation
        const cfgorg = cfg.orgs[req.params.org]
        if (!cfgorg) {
            setRes(res, 400).json(er(4))
            return
        }

        /*  Appel de l'opération
            Retourne un objet result :
            Pour un GET :
                result.type : type mime
                result.bytes : si le résultat est du binaire (ume image ...)
            Pour un POST :
                result : objet résultat
            En cas d'erreur :
                result.error : objet erreur {c:99 , m:"...", s:" trace "}
            Sur un POST, username password tirés de l'objet body sont passés en argument
        */
       // récupère l'objet contenant les arguments et en extrait username et password
        const args = isGet ? req.query : req.body
        pfx += ' func=' + req.params.mod + '/' + req.params.func + ' org=' + req.params.org
        if (dev) console.log(pfx)
        const result = await func(cfgorg, args, isGet)

        if (result.erreur) { // la réponse est une erreur fonctionnelle - descriptif dans erreur
            console.log(pfx + ' 400=' + JSON.stringify(result.erreur))
            setRes(res, 400).json(result.erreur)
        } else { // la réponse contient le résultat attendu
            if (dev) console.log(pfx + ' 200')
            if (isGet)
                setRes(res, 200).type(result.type).send(result.bytes)
            else
                setRes(res, 200).json(result)
        }            
	} catch(e) {
        // exception non prévue ou prévue
        let x
        if (e.apperror) { // erreur trappée déjà mise en forme en tant que apperror 
            x = e
        } else { // erreur non trappée : mise en forme en apperror
            x = { apperror : { c: 0, m:'BUG : erreur inattendu' }}
            if (e.message) x.apperror.d = e.message
            if (e.stack) x.apperror.s = e.stack
        }
        if (!dev) console.log(pfx)
        console.log(pfx + ' 400=' + JSON.stringify(x))
		setRes(res, 401).json(x)
	}
}

/*
Récupération de la configuration
Dans la configuration de chaque environnement, son code est inséré
*/
const configjson = fs.readFileSync("./config.json")
let cfg
try {
    cfg = JSON.parse(configjson)
} catch(e) {
    throw new Error(" Erreur de parsing de config.json : " + e.message)
}

// Les sites appelent souvent favicon.ico
const favicon = fs.readFileSync("./favicon.ico")

const app = express()
app.use(express.json()) // parsing des application/json

// OPTIONS est toujours envoyé pour tester les appels cross origin
app.use("/", (req, res, next) => {
    if (req.method === 'OPTIONS')
        setRes(res, 200).type("text/plain").send("");
    else
        next()
})

/**** favicon.ico du sites ****/
app.get("/favicon.ico", (req, res) => {
	setRes(res, 200).type("ico").send(favicon)
});

/**** ping du site ****/
app.get("/ping", (req, res) => {
    setRes(res, 200).type("text/plain").send(new Date().toISOString())
});

/**** appels des opérations ****/
app.use("/:org/:mod/:func", async (req, res) => { 
    await operation(req, res)
})

// fonction appelée juste après l'écoute. Initialise les modules sur leurs fonctiopns atStart
function atStart() {
    for (let m in modules) {
        const mod =  modules[m]
        if (mod && mod.atStart) mod.atStart(cfg)
    }
}

/****** starts listen ***************************/
// Pour installation sur o2switch
// https://faq.o2switch.fr/hebergement-mutualise/tutoriels-cpanel/app-nodejs
const isPassenger = typeof(PhusionPassenger) !== 'undefined'
if (isPassenger) {
    PhusionPassenger.configure({ autoInstall: false })
}

console.log("server.js : isPassenger = " + isPassenger)

try {
    let server
    const port = isPassenger ? 'passenger' : (cfg.port || (!cfg.https ? 8080 : 8443))
    // Création en http ou 'passenger'
    if (!cfg.https)
        server = http.createServer(app).listen(port, () => {
            console.log("HTTP server running on port " + port)
            try {
                atStart()
            } catch (e) {
                console.log("HTTP server atStart erreur : " + e.message)
            }
        })
    else {
        // Création en https avec un certificat et sa clé de signature
        const key = fs.readFileSync("privkey.pem")
        const cert = fs.readFileSync("fullchain.pem")
        server = https.createServer({key:key, cert:cert}, app).listen(port, () => {
            console.log("HTTP/S server running on port " + port)
            try {
                atStart()
            } catch (e) {
                console.log("HTTP server atStart erreur : " + e.message)
            }
        });		
    }
    server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
        console.error("server.js : HTTP error = " + e.message)
    })
} catch(e) { // exception générale. Ne vrait jamais être levée
    console.error("server.js : catch global = " + e.message)
}
