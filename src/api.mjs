import { schemas } from './schemas.mjs'
import { serial, deserial } from './util.mjs'

export const version = '1'

export const PINGTO = 10000 // en secondes

export const E_BRK = -1 // Interruption volontaire de l'opération
export const E_WS = -2 // Toutes erreurs de réseau
export const E_DB = -3 // Toutes erreurs d'accès à la base locale
export const E_BRO = -4 // Erreur inattendue trappée sur le browser
export const E_SRV = -5 // Erreur inattendue trappée sur le serveur
export const X_SRV = -6 // Erreur fonctionnelle trappée sur le serveur transmise en exception
export const F_BRO = -7 // Erreur fonctionnelle trappée sur le browser
export const F_SRV = -8 // Erreur fonctionnelle trappée sur le serveur transmise en résultat

export class AppExc {
  constructor (code, message, stack) {
    this.code = code
    this.message = message || '?'
    if (stack) this.stack = stack
  }

  toString () {
    return JSON.stringify(this)
  }
}

export const EXBRK = new AppExc(E_BRK, 'Interruption volontaire')
export const EXPS = new AppExc(F_BRO, 'La phrase secrète a changé depuis l\'authentification du comptE Déconnexion et reconnexion requise')

export const MC = {
  NOUVEAU: 255,
  LISTENOIRE: 254,
  PARRAIN: 253,
  FILLEUL: 252,
  INTRODUCTEUR: 251,
  INTRODUIT: 250,
  FAVORI: 249,
  IMPORTANT: 248,
  OBSOLETE: 247,
  ALIRE: 246,
  ATRAITER: 245
}

export const SIZEAV = 5
export const SIZEGR = 3

export const INDEXT = {
  SECRET: 0,
  AVATAR: 1,
  CONTACT: 2,
  RENCONTRE: 3,
  PARRAIN: 4,
  GROUPE: 1,
  MEMBRE: 2
}

/*
- `versions` (id) : table des prochains numéros de versions (actuel et dernière sauvegarde) et autres singletons clé / valeur
- `avgrvq` (id) : volumes et quotas d'un avatar ou groupe
- `avrsa` (id) : clé publique d'un avatar

_**Tables aussi persistantes sur le client (IDB)**_

- `compte` (id) : authentification et liste des avatars d'un compte
- `prefs` (id) : données et préférences d'un compte
- `compta` (id) : ligne comptable du compte
- `ardoise` (id) : ardoise du compte avec parrain / comptables
- `avatar` (id) : données d'un avatar et liste de ses contacts
- `invitgr` (id, ni) : invitation reçue par un avatar à devenir membre d'un groupe
- `contact` (id, ic) : données d'un contact d'un avatar
- `rencontre` (prh) id : communication par A de son nom complet à un avatar B non connu de A dans l'application
- `parrain` (pph) id : parrainage par un avatar A de la création d'un nouveau compte
- `groupe` (id) : données du groupe et liste de ses avatars, invités ou ayant été pressentis, un jour à être membre
- `membre` (id, im) : données d'un membre du groupe
- `secret` (id, ns) : données d'un secret d'un avatar ou groupe
*/

schemas.forSchema({
  name: 'rowavatar',
  cols: ['id', 'v', 'st', 'vcv', 'dds', 'cva', 'lgrk', 'vsh']
})

schemas.forSchema({
  name: 'rowavrsa',
  cols: ['id', 'clepub', 'vsh']
})

schemas.forSchema({
  name: 'rowcompte',
  cols: ['id', 'v', 'dds', 'dpbh', 'pcbh', 'kx', 'cprivk', 'mack', 'vsh']
})

schemas.forSchema({
  name: 'rowprefs',
  cols: ['id', 'v', 'mapk', 'vsh']
})

schemas.forSchema({
  name: 'rowcompta',
  cols: ['id', 'idp', 'v', 'dds', 'st', 'dst', 'data', 'vsh']
})

schemas.forSchema({
  name: 'ardoise',
  cols: ['id', 'v', 'dhe', 'dhl', 'mcp', 'mcc', 'data', 'vsh']
})

schemas.forSchema({
  name: 'rowcontact',
  cols: ['id', 'ic', 'v', 'st', 'ardc', 'datap', 'datak', 'mc', 'infok', 'vsh']
})

schemas.forSchema({
  name: 'rowgroupe',
  cols: ['id', 'v', 'dds', 'st', 'stxy', 'idhg', 'v1', 'v2', 'f1', 'f2', 'cvg', 'mcg', 'vsh']
})

schemas.forSchema({
  name: 'rowinvitgr',
  cols: ['id', 'ni', 'datap']
})

schemas.forSchema({
  name: 'rowmembre',
  cols: ['id', 'im', 'v', 'st', 'vote', 'mc', 'infok', 'datag', 'ardg', 'vsh']
})

schemas.forSchema({
  name: 'rowparrain',
  cols: ['pph', 'id', 'v', 'dlv', 'st', 'datak', 'datax', 'data2k', 'ardc', 'vsh']
})

schemas.forSchema({
  name: 'rowrencontre',
  cols: ['prh', 'id', 'v', 'dlv', 'st', 'datak', 'nomax', 'nombx', 'ardx', 'vsh']
})

schemas.forSchema({
  name: 'rowsecret',
  cols: ['id', 'ns', 'ic', 'v', 'st', 'ora', 'v1', 'v2', 'mc', 'txts', 'mpjs', 'dups', 'refs', 'vsh']
})

schemas.forSchema({
  name: 'rowversions',
  cols: ['id', 'v']
})

schemas.forSchema({
  name: 'rowcv',
  cols: ['id', 'vcv', 'st', 'cva']
})

schemas.forSchema({
  name: 'syncList',
  cols: ['sessionId', 'dh', 'rowItems']
})

/** Compteurs ***************************
- `j` : jour de calcul
- `v1 v1m` : volume v1 actuel et total du mois
- `v2 v2m` : volume v2 actuel et total du mois
- `trm` : volume transféré dans le mois
- `f1 f2` : forfait de v1 et v2
- `tr` : array de 14 compteurs (les 14 derniers jours) de volume journalier de transfert
- `rtr` : ratio de la moyenne des tr / forfait v2
- `hist` : array de 12 éléments, un par mois. 4 bytes par éléments.
  - `f1 f2` : forfaits du mois
  - `r1` : ratio du v1 du mois par rapport à son forfait.
  - `r2` : ratio du v2 du mois par rapport à son forfait.
  - `r3` : ratio des transferts cumulés du mois / volume du forfait v2
- `res1 res2` : pour un parrain, réserve de forfaits v1 et v2.
- `t1 t2` : pour un parrain, total des forfaits 1 et 2 attribués aux filleuls.
*/

const lch1 = ['j', 'v1', 'v1m', 'v2', 'v2m', 'trm', 'f1', 'f2', 'rtr', 'res1', 'res2', 't1', 't2']
const MB1 = 1000000
const MB100 = 100000000
const NTRJ = 14

function mx255 (x) { const n = Math.round(x * 100); return n > 255 ? 255 : n }

export class Compteurs {
  constructor (data) {
    const src = data ? deserial(data) : null
    this.j = src ? src.j : new DateJour().nbj
    this.v1 = src ? src.v1 : 0
    this.v1m = src ? src.v1m : 0
    this.v2 = src ? src.v2 : 0
    this.v2m = src ? src.v2m : 0
    this.trm = src ? src.trm : 0
    this.f1 = src ? src.f1 : 0
    this.f2 = src ? src.f2 : 0
    this.rtr = src ? src.rtr : 0
    if (src) {
      this.tr = src.tr
      this.hist = src.hist
    } else {
      this.tr = new Array(NTRJ)
      this.tr.fill(0, 0, NTRJ)
      this.hist = new Array(12)
      for (let i = 0; i < 12; i++) this.hist[i] = new Uint8Array([0, 0, 0, 0, 0])
    }
    this.res1 = src ? src.res1 : 0
    this.res2 = src ? src.res2 : 0
    this.t1 = src ? src.t1 : 0
    this.t2 = src ? src.t2 : 0
    this.maj = false
  }

  get copie () { // retourne un {...} contenant les champs (ce N'EST PAS un OBJET Compteurs)
    const c = {}
    lch1.forEach(f => { c[f] = this[f] })
    c.tr = new Array(NTRJ)
    for (let i = 0; i < NTRJ; i++) c.tr[i] = this.tr[i]
    c.hist = new Array(12)
    for (let i = 0; i < 12; i++) {
      const x = new Uint8Array(5)
      for (let j = 0; j < 5; j++) x[j] = this.hist[i][j]
      c.hist[i] = x
    }
    return c
  }

  get serial () { this.maj = false; return serial(this.copie) }

  setV1 (delta) {
    this.calculauj()
    if (this.v1 + delta > this.f1 * MB1) return false
    this.v1m = Math.round(((this.v1m * this.dj.jj) + delta) / this.dj.jj)
    this.v1 = this.v1 + delta
    this.hist[this.dj.mm - 1][2] = mx255(this.v1m / this.f1 * MB1)
    this.maj = true
    return true
  }

  setV2 (delta) {
    this.calculauj()
    if (this.v2 + delta > this.f2 * MB100) return false
    this.v2m = Math.round(((this.v2m * this.dj.jj) + delta) / this.dj.jj)
    this.v2 = this.v2 + delta
    this.hist[this.dj.mm - 1][3] = mx255(this.v2m / this.f2 * MB100)
    this.maj = true
    return true
  }

  setTr (delta) {
    this.calculauj()
    this.trm = Math.round(((this.trm * this.dj.jj) + delta) / this.dj.jj)
    this.hist[this.dj.mm - 1][4] = mx255(this.trm / this.f2 * MB100)
    this.tr[0] = this.tr[0] + delta
    let s = 0
    this.tr.forEach(n => { s += n })
    this.rtr = mx255(s / this.f2 * MB100)
    this.maj = true
    return true
  }

  setF1 (f) {
    this.calculauj()
    if (this.v1 > f * MB1) return false
    this.f1 = f
    this.hist[this.dj.mm - 1][2] = mx255(this.v1m / this.f1 * MB1)
    this.maj = true
    return true
  }

  setF2 (f) {
    this.calculauj()
    if (this.v2 > f * MB100) return false
    this.f2 = f
    this.hist[this.dj.mm - 1][3] = mx255(this.v2m / this.f2 * MB100)
    this.maj = true
    return true
  }

  setRes (delta) { // maj réserve de forfaits à attribués aux dilleuls
    this.calculauj()
    this.res1 = this.res1 + delta[0]
    this.res2 = this.res2 + delta[1]
    this.maj = true
    return true
  }

  setFF (delta1, delta2) { // maj forfaits attribués à un filleul
    if ((this.t1 + delta1 > this.res1) || (this.t1 + delta1 > this.res1)) return false
    this.t1 = this.t1 + delta1
    this.t2 = this.t2 + delta2
    this.res1 = this.res1 - delta1
    this.res2 = this.res2 - delta2
    this.maj = true
    return true
  }

  shiftTr (nj) {
    if (nj <= 0) return
    if (nj >= NTRJ) {
      this.tr.fill(0, 0, NTRJ)
    } else {
      // eslint-disable-next-line for-direction
      for (let i = NTRJ - 1; i >= 0; i--) this.tr[i] = i > nj ? this.tr[i - nj] : 0
    }
    let s = 0
    this.tr.forEach(n => { s += n })
    this.rtr = mx255(s / this.f2 * MB100)
  }

  calculauj () { // recalcul à aujourd'hui en fonction du dernier jour de calcul
    const dj = new DateJour()
    this.dj = dj
    if (dj.nbj === this.j) return this // déjà normalisé, calculé aujourd'hui
    this.maj = true
    const dja = new DateJour(this.j)
    if (dja.aa === dj.aa && dja.mm === dj.mm) {
      // Dans le même mois
      // Recalcul des moyennes du mois et shift de tr (recalcul rtr)
      this.v1m = Math.round(((this.v1m * dja.jj) + (this.v1 * (dj.jj - dja.jj))) / dj.jj)
      this.v2m = Math.round(((this.v2m * dja.jj) + (this.v2 * (dj.jj - dja.jj))) / dj.jj)
      this.trm = Math.round((this.trm * dja.jj) / dj.jj)
      this.hist[dj.mm - 1][2] = mx255(this.v1m / this.f1 * MB1)
      this.hist[dj.mm - 1][3] = mx255(this.v2m / this.f2 * MB100)
      this.hist[dj.mm - 1][4] = mx255(this.trm / this.f2 * MB100)
      this.shiftTr(dj.jj - dja.jj)
    } else {
      // Moyennes sur le dernier mois de calcul
      const v1m = Math.round(((this.v1m * dja.jj) + (this.v1 * (dja.nbjm - dja.jj))) / dja.jj)
      const v2m = Math.round(((this.v2m * dja.jj) + (this.v2 * (dja.nbjm - dja.jj))) / dja.jj)
      const trm = Math.round((this.trm * dja.jj) / dja.jj)
      const r1 = mx255(v1m / this.f1 * MB1)
      const r2 = mx255(v2m / this.f2 * MB100)
      const r3 = mx255(trm / this.f2 * MB100)

      if ((dj.mm === dja.mm + 1 && dj.aa === dja.aa) || (dj.mm === 1 && dja.mm === 1 && dj.aa === dja.aa + 1)) {
        // dernier calcul le mois précédent
        this.v1m = v1m
        this.v2m = v2m
        this.trm = 0
        this.hist[dja.mm - 1] = new Uint8Array([this.f1, this.f2, r1, r2, r3])
        this.hist[dj.mm - 1] = new Uint8Array([this.f1, this.f2, r1, r2, 0])
        this.shiftTr(dja.nbjm - dja.jj + dj.jj) // shift de l'historique
      } else {
        // plus d'un mois depuis le dernier calcul
        // fin du mois du dernier calcul : nb jours du mois du dernier calcul - dja.nbjm
        const nbm = 12 - dja.mm + dj.mm + (12 * (dj.aa - dja.aa)) // nb de mois depuis dernier calcul
        this.v1m = v1m
        this.v2m = v2m
        this.trm = 0
        this.shiftTr(NTRJ) // shift de l'historique (raz, plus de NTRJ jours
        if (nbm >= 12) {
          for (let i = 0; i < 12; i++) this.hist[i] = new Uint8Array([this.f1, this.f2, r1, r2, 0])
        } else {
          this.hist[dja.mm - 1] = new Uint8Array([this.f1, this.f2, r1, r2, r3]) // le dernier mois calculé
          if (dja.mm < dj.mm) {
            // dans la même année : suivant avec tr = 0
            for (let i = dja.mm; i < dj.mm; i++) this.hist[i] = new Uint8Array([this.f1, this.f2, r1, r2, 0])
          } else {
            // sur fin d'anée et début suivante avec tr = 0
            for (let i = dja.mm; i < 12; i++) this.hist[i] = new Uint8Array([this.f1, this.f2, r1, r2, 0])
            for (let i = 0; i < dj.mm; i++) this.hist[i] = new Uint8Array([this.f1, this.f2, r1, r2, 0])
          }
        }
      }
    }
    this.j = this.dj.nbj
    return this
  }
}

const j0 = Math.floor(new Date('2020-01-01T00:00:00').getTime() / 86400000)
const nbjm = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export class DateJour {
  constructor (j) {
    const d = !j ? new Date() : (j instanceof Date ? j : new Date((j0 + j) * 86400000))
    this.aa = d.getFullYear() % 100
    this.mm = d.getMonth() + 1
    this.jj = d.getDate()
    this.nbj = Math.floor(d.getTime() / 86400000) - j0
  }

  get aaaammjj () { return this.Date.toISOString().substring(0, 10) }

  get nbjm () { return nbjm[this.mm] + (this.aa % 4 === 0 ? 1 : 0) }

  get Date () { return new Date((j0 + this.nbj) * 86400000) }
}

export const j99 = new DateJour(new Date('2099-12-31T23:59:59')).nbj // 29220 = 365 * 80 + 20 (années bisextiles)
