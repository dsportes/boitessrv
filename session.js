const crypto = require('./crypto.js')
const base64url = require('base64url')
const now = require('nano-time')
const api = require('./api.js')

const dev = process.env.NODE_ENV === "development"

const sessions = new Map()

function getSession (id) { return sessions.get(id) }
exports.getSession = getSession

function getdhc() {
  return parseInt(now.micro(), 10)
}

let wss // pour tester

/* Appelé sur l'événement 'connection' reçu du Web Server
- request : requête Http correspondante : on ne sait rien en faire a priori
- wss1 : server web socket
*/
class Session {
  constructor (ws, request, wss1) {
    wss = wss1
    this.ws = ws
    this.dhping = 0
    this.sessionId = null
    this.compteId = null
    this.avatarsIds = []
    this.groupesIds = []
    this.cvsIds = []
    this.ws.onerror = (e) => {
      console.log(e)
      if (this.sessionId)
        sessions.delete(this.sessionId)
    }
    this.ws.onclose = (e) => {
      if (this.sessionId)
        sessions.delete(this.sessionId)
      console.log('Fermeture de session détectée:' + this.sessionId)
    }
    this.ws.onmessage = (m) => {
      // seul message reçu : ping avec le sessionid
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
        console.log('Ouverture de session reçue: ' + newid + ' / ' + d.toISOString())
      } else {
        /* if (dev) */ console.log('Ping reçu: ' + newid + ' / ' + d.toISOString())
      }
      // réponse pong
      const pong = { sessionId: newid, dh: getdhc(), syncList: null }
      const buf = api.types.synclist.toBuffer(pong)
      const pong2 = api.types.synclist.fromBuffer(buf)
      this.ws.send(buf)
    }    
  }

  setCompteId (id) {
    this.compteId = id
  }

  setAvatarId (id) {
    if (this.avatarsIds.indexOf(id) === -1) this.avatarsIds.push(id)
  }

  setGroupeId (id) {
    if (this.groupesIds.indexOf(id) === -1) this.groupeIds.push(id)
  }

  setCvId (id) {
    if (this.cvsIds.indexOf(id) === -1) this.cvsIds.push(id)
  }

  send (data) {
    this.ws.send(data)
  }

  sync (rows, delobjs) {
    /* 
    liste d'envoi : liste des rows créés / modifiés, liste des objets supprimés
    Uniquement ceux concerné par la session
    */
  }
}
exports.Session = Session

function syncSessions(rows, delobjs) {
  rows.forEach(row => {
    delete row.datax
    delete row.datay
  })
  for (const s of sessions) {
    sessions[s].sync(rows, delobjs)
  }
}
exports.syncSessions = syncSessions