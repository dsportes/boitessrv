const crypto = require('./crypto.js')
const base64url = require('base64url')

const sessions = new Map()

let wss

class Session {
    constructor (ws, request, wss1) {
        wss = wss1
        this.ws = ws
        this.sessionId = base64url(crypto.random(5))
        sessions.set(this.sessionId, this)
        this.ws.onerror = (e) => {
            console.log(e)
            this.onClose()
            sessions.delete(this.sessionId)
        }
        this.ws.onclose = (e) => {
            this.onClose()
            sessions.delete(this.sessionId)
        }
        this.ws.onmessage = (m) => {
            try {
                const x = JSON.parse(m.data)
                const fn = this.constructor.prototype[x.fn]
                if (fn) {
                    fn.call(this, x)
                } else {
                    console.log('Session:' + this.sessionId + ' Fonction inconnue:' + x.fn)
                }
            } catch (e) {
                console.log('Session:' + this.sessionId + ' Erreur de parse:' + e + '\ndata:' + m.data)
            }
        }    
    }

    send (m) {
        this.ws.send(JSON.stringify(m))
    }

    onClose () {
        console.log('Close : ' + this.sessionId)
    }

    f1(args) {
        console.log('Session:' + this.sessionId + '\ndata:' + JSON.stringify(args))
    }
    
    f2(args) {
        console.log('Session:' + this.sessionId + '\ndata:' + JSON.stringify(args))        
    }
}

exports.Session = Session
