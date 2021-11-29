import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const now = require('nano-time')
import { PINGTO } from './api.mjs'
import { schemas } from './schemas.mjs'

const dev = process.env.NODE_ENV === 'development'

const sessions = new Map()

export function getSession (id) { return sessions.get(id) }

function getdhc() {
  return parseInt(now.micro(), 10)
}

const sessionsmortes = new Set()

// eslint-disable-next-line no-unused-vars
const gcSessions = setInterval(() => {
  const dh1 = getdhc()
  const max = PINGTO * 6 * 10000
  sessionsmortes.clear()
  sessions.forEach((session, sessionId) => {
    const dh2 = session.dhping
    if (dh2 !== 0 && (dh1 - dh2 > max)) sessionsmortes.add(sessionId)
  })
  sessionsmortes.forEach((sid) => {
    sessions.delete(sid)
  })
  sessionsmortes.clear()
}, PINGTO * 1000)

/* Appelé sur l'événement 'connection' reçu du Web Server
- request : requête Http correspondante : on ne sait rien en faire a priori
- wss1 : server web socket
*/
export class Session {
  constructor (ws /*, request, wss1*/) {
    this.ws = ws
    this.dhping = 0
    this.sessionId = null
    this.compteId = null
    this.avatarsIds = []
    this.groupesIds = []
    this.cvsIds = []
    this.nbpings = 0
    this.ws.onerror = (e) => {
      console.log(e)
      if (this.sessionId)
        sessions.delete(this.sessionId)
    }
    this.ws.onclose = (/* e */) => {
      if (this.sessionId)
        sessions.delete(this.sessionId)
      if (dev) console.log('Fermeture de session détectée:' + this.sessionId)
    }
    this.ws.onmessage = (m) => {
      // seul message reçu : ping avec le sessionid
      this.nbpings++
      const newid = m.data
      const d = new Date()
      this.dhping = d.getTime()
      if (newid !== this.sessionId) {
        // nouvelle session
        if (this.sessionId) {
          sessions.delete(this.sessionId)
        }
        this.sessionId = newid
        sessions.set(newid, this)
        if (dev) console.log('Ouverture de session reçue: ' + newid + ' / ' + d.toISOString())
      } else {
        if (dev) console.log('Ping reçu: ' + newid + ' / ' + d.toISOString())
      }
      // réponse pong
      if (this.nbpings < 1000000) { // pour tester et ne plus envoyer de pong au delà de N pings
        const pong = { sessionId: newid, dh: getdhc(), syncList: null }
        const buf = schemas.serialize('synclist', pong)
        this.ws.send(buf)
      }
    }    
  }

  send (data) {
    this.ws.send(data)
  }

  sync (/* rows, delobjs */) {
    /* 
    liste d'envoi : liste des rows créés / modifiés, liste des objets supprimés
    Uniquement ceux concerné par la session
    */
  }
}

export function syncSessions(rows, delobjs) {
  rows.forEach(row => {
    delete row.datax
    delete row.datay
  })
  for (const s of sessions) {
    sessions[s].sync(rows, delobjs)
  }
}
