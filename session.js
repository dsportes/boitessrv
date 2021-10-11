const crypto = require('./crypto.js')
const base64url = require('base64url')

const sessions = new Map()

let wss // pour tester

/* Appelé sur l'événement 'connection' reçu du Web Server
- request : requête Http correspondante : on ne sait rien en faire a priori
- wss1 : server web socket
*/
class Session {
    constructor (ws, request, wss1) {
        wss = wss1
        this.ws = ws
        this.sessionId = null
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
            // seul message reçu : l'initialisation de session avec le sessionid
            this.sessionId = m.data
            sessions.set(this.sessionId, this)
            console.log('Ouverture de session reçue:' + this.sessionId)
        }    
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