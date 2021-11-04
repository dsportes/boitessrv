const fs = require("fs")
const http = require("http")
const https = require("https")
const express = require('express')
const WebSocket = require('ws')
const Session = require("./session.js").Session
const api = require('./api')
const AppExc = require('./api').AppExc
const crypt = require('./crypto.js')

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
function setRes(res, status, respType) {
    res.status(status).set({
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Methods" : "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-API-version"
    })
    return res.type(respType ? respType : 'application/octet-stream')
}

function er(c) {
    const l = [
        "Erreur non récupérée : ", // 0
        "Origine non autorisée", // 1
        "Module inconnu", // 2
        "Fonction inconnue", // 3
        "Organisation inconnue", // 4
        "Version d'API incompatble", // 5
    ]
    throw new AppExc(-(c + 900), l[c])
}

/*
Traitement générique d'une opération
*/
async function operation(req, res) {
  let pfx = new Date().toISOString() // prefix de log
  try {
    let isGet = req.method === "GET"
    // vérification de l'origine de la requête
    if (!checkOrigin(req)) {
        setRes(res, 400).send(er(1))
        return
    }
    // récupération du module traitant l'opération
    const mod = modules[req.params.mod]
    if (!mod) {
        setRes(res, 400).send(er(2))
        return
    }
    // récupétration de la fonction de ce module traitant l'opération
    const f = req.params.func
    const func = mod[f]
    if (!func) {
        setRes(res, 400).send(er(3))
        return
    }
    // reconnaissance de l'organisation
    const cfgorg = cfg.orgs[req.params.org]
    if (!cfgorg) {
        setRes(res, 400).send(er(4))
        return
    }
    // vérification de la version de l'API
    const apiv = req.headers['x-api-version']
    if (apiv && apiv !== api.version) {
        setRes(res, 400).send(er(5))
        return
    }

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
    const at = api.argTypes[req.params.func]
    let args
    if (isGet) {
      args = req.query
    } else {
      const type = at && at.length > 0 ? at[0] : null
      args = type ? type.fromBuffer(req.body) : JSON.parse(Buffer.from(req.body).toString())
    }
    pfx += ' func=' + req.params.mod + '/' + req.params.func + ' org=' + req.params.org
    if (dev) console.log(pfx)
    const result = await func(cfgorg, args, isGet)
    if (dev) console.log(pfx + ' 200')
    if (isGet)
      setRes(res, 200, result.type || 'application/octet-stream').send(result.bytes)
    else {
      const type = at && at.length > 1 ? at[1] : null
      const bytes = type ? type.toBuffer(result) : Buffer.from(JSON.stringify(result))
      // const obj = type.fromBuffer(bytes)
      setRes(res, 200).send(bytes)
    }         
  } catch(e) {
    let httpst
    let s
    // exception non prévue ou prévue
    if (e instanceof AppExc) { // erreur trappée déjà mise en forme en tant que AppExc 
      httpst = e.code < 0 ? 401 : 400
      s = e.toString() // JSON
    } else {
      // erreur non trappée : mise en forme en AppExc
      httpst = 402
      s = new AppExc( -999, 'BUG : erreur inattendue sur le serveur', e.message, e.stack).toString()
    }
    if (dev) console.log(pfx + ' ' + httpst + ' : ' + s)
    setRes(res, httpst).send(Buffer.from(s))
  }
}

/*
const mimetype = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "svg": "image/image/svg+xml"
}
*/

/*
Récupération de la configuration
Dans la configuration de chaque environnement, son code est inséré
*/
const configjson = fs.readFileSync("./config.json")
let cfg
try {
    const options = { fileMustExist: true, verbose: console.log }
    cfg = JSON.parse(configjson)
    for(let org in cfg.orgs) {
        const e = cfg.orgs[org]
        e.code = org
        e.db = require('better-sqlite3')('./databases/' + org + '.db3', options);
        /*
        const b = fs.readFileSync('./icons/' + org + '.' + e.typeicon, 'base64')
        e.icon = 'data:' + mimetype[e.typeicon] + ';base64,' + b
        */
    }
    crypt.setSalts (fs.readFileSync('./salts'))
    // crypt.test()
} catch(e) {
    throw new Error(" Erreur de parsing de config.json : " + e.message)
}

// Les sites appelent souvent favicon.ico
const favicon = fs.readFileSync("./favicon.ico")
// const deficon = 'data:image/png;base64,' + fs.readFileSync('./anonymous.png', 'base64')

const app = express()
app.use(express.json()) // parsing des application/json

// OPTIONS est toujours envoyé pour tester les appels cross origin
app.use("/", (req, res, next) => {
    if (req.method === 'OPTIONS')
        setRes(res, 200, 'text/plain').send('')
    else
        next()
})

/**** favicon.ico du sites ****/
app.get("/favicon.ico", (req, res) => {
	setRes(res, 200, 'image/x-icon').send(favicon)
})

/**** ping du site ****/
app.get("/ping", (req, res) => {
    setRes(res, 200, 'text/plain').send(new Date().toISOString())
})

/**** generation de paire de clés RSA 
app.get("/genkeypair", (req, res) => {
  const {publicKey, privateKey} = crypt.genKeyPair()
  const x = JSON.stringify([ publicKey, privateKey])
  setRes(res, 200, 'text/plain').send(x)
})
****/

/**** icon d'une organisation
app.get("/icon/:org", (req, res) => {
    const e = cfg.orgs[req.params.org]
    const ic = e ? e.icon : 'KO'
    setRes(res, 200, 'text/plain').send(ic)
})
****/

/**** appels des opérations ****/
app.use("/:org/:mod/:func", async (req, res) => {
    // push the data to body
    const body = [];
    req.on('data', (chunk) => {
        body.push(chunk);
    }).on('end', async () => {
        req.body = Buffer.concat(body)
        await operation(req, res)
    })
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

    const wss = new WebSocket.Server({ server })
    wss.on('connection', (ws, request) => {
        if (checkOrigin(request)) {
            new Session (ws, request, wss)
        } else {
            ws.close()
        }
    })

} catch(e) { // exception générale. Ne devrait jamais être levée
    console.error("server.js : catch global = " + e.message)
}
