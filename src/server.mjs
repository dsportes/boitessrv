import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const fs = require('fs')
const http = require('http')
const https = require('https')
const process = require('process')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')
import { encode, decode } from '@msgpack/msgpack'
import { Session } from './session.mjs'
import { AppExc, E_SRV, X_SRV, F_SRV, version } from './api.mjs'
import { getFile /*, putFile */ } from './storage.mjs'
import { decryptersoft } from './webcrypto.mjs'

import { m1fonctions } from './m1.mjs'
const modules = { m1: m1fonctions }

const dev = process.env.NODE_ENV === 'development'

/* 
vérification que l'origine appartient à la liste des origines autorisées (q'il y en a une)
localhost passe toujours
*/
function checkOrigin(req) {
  if (!cfg.origins || !cfg.origins.length) return true
  let origin = req.headers['origin']
  if (!origin || origin === 'null') {
    const referer = req.headers['referer'];
    if (referer) {
      const i = referer.indexOf('/', 10);
      if (i !== -1)
        origin = referer.substring(0, i);
    }
  }
  if (!origin || origin === 'null')
    origin = req.headers['host'];
  if (origin && origin.startsWith('http://localhost'))
    origin = 'localhost'
  if (cfg.origins.indexOf(origin) !== -1) return true
  console.log('Origine refusée : ' + origin)
  return false
}

// positionne les headers et le status d'une réponse. Permet d'accepter des requêtes cross origin des browsers
function setRes(res, status, respType) {
  res.status(status).set({
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods' : 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-API-version'
  })
  return res.type(respType ? respType : 'application/octet-stream')
}

function er(c) {
  const l = [
    'Erreur non récupérée : ', // 0
    'Origine non autorisée', // 1
    'Module inconnu', // 2
    'Fonction inconnue', // 3
    'Organisation inconnue', // 4
    'Version d\'API incompatble', // 5
    'File not found' // 6
  ]
  throw new AppExc(E_SRV, l[c])
}

/*
Traitement générique d'une opération
*/
async function operation(req, res) {
  let pfx = new Date().toISOString() // prefix de log
  try {
    const isGet = req.method === 'GET'
    // vérification de l'origine de la requête
    if (!checkOrigin(req)) {
      setRes(res, 402).send(er(1))
      return
    }
    // récupération du module traitant l'opération
    const mod = modules[req.params.mod]
    if (!mod) {
      setRes(res, 402).send(er(2))
      return
    }
    // récupétration de la fonction de ce module traitant l'opération
    const f = req.params.func
    const func = mod[f]
    if (!func) {
      setRes(res, 402).send(er(3))
      return
    }
    // reconnaissance de l'organisation
    const cfgorg = cfg.orgs[req.params.org]
    if (!cfgorg) {
      setRes(res, 402).send(er(4))
      return
    }
    // vérification de la version de l'API
    const apiv = req.headers['x-api-version']
    if (apiv && apiv !== version) {
      setRes(res, 402).send(er(5))
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
    const args = isGet ? req.query : decode(req.body)
    pfx += ' func=' + req.params.mod + '/' + req.params.func + ' org=' + req.params.org
    if (dev) console.log(pfx)
    const result = await func(cfgorg, args, isGet)
    if (dev) console.log(pfx + ' 200')
    if (isGet)
      setRes(res, 200, result.type || 'application/octet-stream').send(Buffer.from(result.bytes))
    else {
      setRes(res, 200).send(Buffer.from(encode(result)))
    }         
  } catch(e) {
    let httpst
    let s
    // exception non prévue ou prévue
    if (e instanceof AppExc) { // erreur trappée déjà mise en forme en tant que AppExc 
      httpst = e.code === F_SRV ? 400 : (e.code === X_SRV ? 401 : 402)
      s = e.toString() // JSON
    } else {
      // erreur non trappée : mise en forme en AppExc
      httpst = 402
      const xx = (e.stack ? e.stack + '\n' : '') + lastSql.join('\n')
      s = new AppExc(E_SRV, e.message, xx).toString()
    }
    if (dev) console.log(pfx + ' ' + httpst + ' : ' + s)
    setRes(res, httpst).send(Buffer.from(s))
  }
}

const dirs = { configdir: './config', dbdir: './databases' }
process.argv.forEach((arg) => {
  if (arg.startsWith('configdir=')) dirs.configdir = arg.substring('configdir='.length)
  if (arg.startsWith('dbdir=')) dirs.dbdir = arg.substring('dbdir='.length)
})

console.log('configdir=' + path.resolve(dirs.configdir))
console.log('dbdir=' + path.resolve(dirs.dbdir))

/*
Récupération de la configuration
Dans la configuration de chaque environnement, son code est inséré
*/

const lastSql = []
function trapSql (msg) {
  if (dev) console.log(msg)
  lastSql.unshift(msg)
  if (lastSql.length > 3) lastSql.length = 3
}

const p1 = path.resolve(dirs.configdir, './config.bin')
let configjson
if (!fs.existsSync(p1)) {
  configjson = fs.readFileSync(path.resolve(dirs.configdir, './config.json'))
} else {
  const dcrypt = decryptersoft(fs.readFileSync(p1))
  configjson = new TextDecoder().decode(dcrypt)
}

let cfg
try {
  const options = { fileMustExist: true, verbose: trapSql }
  cfg = JSON.parse(configjson)
  for(const org in cfg.orgs) {
    const e = cfg.orgs[org]
    e.code = org
    e.isDev = dev
    e.wwwdir = cfg.wwwdir
    e.db = require('better-sqlite3')(path.resolve(dirs.dbdir, org + '.db3'), options);
  }
} catch(e) {
  throw new Error(' Erreur de parsing de config.json : ' + e.message)
}

// Les sites appelent souvent favicon.ico
const favicon = fs.readFileSync(path.resolve(dirs.configdir, './favicon.ico'))
// const deficon = 'data:image/png;base64,' + fs.readFileSync('./anonymous.png', 'base64')

const app = express()
app.use(express.json()) // parsing des application/json

// OPTIONS est toujours envoyé pour tester les appels cross origin
app.use('/', (req, res, next) => {
  if (req.method === 'OPTIONS')
    setRes(res, 200, 'text/plain').send('')
  else
    next()
})

/**** favicon.ico du sites ****/
app.get('/favicon.ico', (req, res) => {
  setRes(res, 200, 'image/x-icon').send(favicon)
})

/**** ping du site ****/
app.get('/ping', (req, res) => {
  setRes(res, 200, 'text/plain').send(new Date().toISOString())
})

app.use('/www/:org/:secid/:pjid', async (req, res) => {
  if (!checkOrigin(req)) {
    setRes(res, 402).send('Origine non autorisée')
    return
  }
  const cfgorg = cfg.orgs[req.params.org]
  if (!cfgorg) {
    setRes(res, 402).send('Organisation inconnue')
    return
  }
  const p = req.params
  const bytes = await getFile(cfg, p.org, p.secid, p.pjid)
  if (bytes) {
    // putFile(cfg, p.org, p.secid, p.pjid, bytes) // pour test
    setRes(res, 200, 'application/octet-stream').send(bytes)
  } else {
    setRes(res, 404).send('File not found')
  }
})

/**** appels des opérations ****/
app.use('/:org/:mod/:func', async (req, res) => {
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
  for (const m in modules) {
    const mod =  modules[m]
    if (mod && mod.atStart) mod.atStart(cfg)
  }
}

/****** starts listen ***************************/
// Pour installation sur o2switch
// https://faq.o2switch.fr/hebergement-mutualise/tutoriels-cpanel/app-nodejs
const isPassenger = typeof(PhusionPassenger) !== 'undefined'
if (isPassenger) {
  // eslint-disable-next-line no-undef
  PhusionPassenger.configure({ autoInstall: false })
}

console.log('isPassenger:' + isPassenger)

try {
  let server
  const port = isPassenger ? 'passenger' : (cfg.port || (!cfg.https ? 8080 : 8443))
  // Création en http ou 'passenger'
  if (!cfg.https)
    server = http.createServer(app).listen(port, () => {
      console.log('HTTP server running on port ' + port)
      try {
        atStart()
      } catch (e) {
        console.log('HTTP server atStart erreur : ' + e.message)
      }
    })
  else {
    // Création en https avec un certificat et sa clé de signature
    const key = fs.readFileSync(path.resolve(dirs.configdir, './privkey.pem'))
    const cert = fs.readFileSync(path.resolve(dirs.configdir, './fullchain.pem'))
    server = https.createServer({key:key, cert:cert}, app).listen(port, () => {
      console.log('HTTP/S server running on port ' + port)
      try {
        atStart()
      } catch (e) {
        console.log('HTTP server atStart erreur : ' + e.message)
      }
    });		
  }
  server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
    console.error('server.js : HTTP error = ' + e.message)
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
  console.error('server.js : catch global = ' + e.message)
}
