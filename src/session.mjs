import { PINGTO } from './api.mjs'
import { schemas } from './schemas.mjs'
import { getdhc } from './util.mjs'

const dev = process.env.NODE_ENV === 'development'

const sessions = new Map()

export function getSession (id) { return sessions.get(id) }

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
    this.raz()
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

  raz () {
    this.compteId = null
    this.avatarsIds = new Set() // Set
    this.groupesIds = new Set // Set
    this.couplesIds = new Set // Set
    this.cvsIds = new Set() // Set
  }

  setCompte (id) {
    this.raz()
    this.compteId = id
  }

  plusAvatars (ar) {
    if (ar && ar.length) ar.forEach(id => { this.avatarsIds.add(id) })
  }

  plusGroupes (ar) {
    if (ar && ar.length) ar.forEach(id => { this.groupesIds.add(id) })
  }

  plusCouples (ar) {
    if (ar && ar.length) ar.forEach(id => { this.couplesIds.add(id) })
  }

  plusCvs (ar) {
    if (ar && ar.length) ar.forEach(id => { this.cvsIds.add(id) })
  }

  moinsAvatars (ar) {
    if (ar && ar.length) ar.forEach(id => { this.avatarsIds.delete(id) })
  }

  moinsGroupes (ar) {
    if (ar && ar.length) ar.forEach(id => { this.groupesIds.delete(id) })
  }

  moinsCouples (ar) {
    if (ar && ar.length) ar.forEach(id => { this.couplesIds.delete(id) })
  }

  moinsCvs (ar) {
    if (ar && ar.length) ar.forEach(id => { this.cvsIds.delete(id) })
  }

  aavatar (rowItem) {
    return this.avatarsIds && this.avatarsIds.has(rowItem.id)
  }

  agroupe (rowItem) {
    return this.groupesIds && this.groupesIds.has(rowItem.id)
  }

  acouple (rowItem) {
    return this.couplesIds && this.couplesIds.has(rowItem.id)
  }

  acv (rowItem) {
    return this.cvsIds && this.cvsIds.has(rowItem.id)
  }

  send (data) {
    this.ws.send(data)
  }

  traiteSyncList (syncList) { // syncList : { sessionId, dh, rowItems }
    // filtre dans rowItems ceux concernés par la session et envoie (éventuellement) le message
    const msg = { sessionId: this.sessionId, dh: syncList.dh, rowItems: [] }
    syncList.rowItems.forEach((rowItem) => {
      switch (rowItem.table) {
      case 'compte' : {
        if (rowItem.id === this.compteId) msg.rowItems.push(rowItem)
        break
      }
      case 'prefs' : {
        if (rowItem.id === this.compteId) msg.rowItems.push(rowItem)
        break
      }
      case 'compta' : {
        if (rowItem.id === this.compteId) msg.rowItems.push(rowItem)
        break
      }
      case 'avatar' : {
        if (this.aavatar(rowItem)) msg.rowItems.push(rowItem)
        break
      }
      case 'groupe' : {
        if (this.agroupe(rowItem)) msg.rowItems.push(rowItem)
        break
      }
      case 'couple' : {
        if (this.acouple(rowItem)) msg.rowItems.push(rowItem)
        break
      }
      case 'membre' : {
        if (this.agroupe(rowItem)) msg.rowItems.push(rowItem)
        break
      }
      case 'secret' : {
        if (this.aavatar(rowItem) || this.agroupe(rowItem) || this.acouple(rowItem)) msg.rowItems.push(rowItem)
        break
      }
      case 'cv' : {
        if (this.acv(rowItem)) msg.rowItems.push(rowItem)
        break
      }
      case 'invitgr' : {
        if (this.aavatar(rowItem)) msg.rowItems.push(rowItem)
        break
      }
      }
    })
    if (msg.rowItems.length) {
      const buf = schemas.serialize('syncList', msg)
      setImmediate(() => {
        this.send(buf)
      })
    }
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

export const syncListQueue = [] // array de syncList : { sessionId, dh, rowItems }

export function processQueue() {
  while (syncListQueue.length) {
    const syncList = syncListQueue[0]
    sessions.forEach((session) => {
      if (syncList.rowItems.length) session.traiteSyncList(syncList)
    })
    syncListQueue.splice(0, 1)
  }
}
