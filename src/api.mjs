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
  cols: ['id', 'dh', 'data', 'vsh']
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
  cols: ['pph', 'id', 'v', 'dlv', 'st', 'f1', 'f2', 'datak', 'datax', 'data2k', 'ardc', 'vsh']
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
- `f1 f2` : forfait de v1 et v2
- `tr` : array de 31 compteurs (les 31 derniers jours) : cumul journalier du volume de transfert de pièces jointes.
- `hist` : array de 12 éléments, un par mois. 4 bytes par éléments.
  - `f1 f2` : forfaits du mois
  - `r1` : ratio du v1 du mois par rapport à son forfait.
  - `r2` : ratio du v2 du mois par rapport à son forfait.
- `res1 res2` : pour un parrain, réserve de forfaits v1 et v2.
- `t1 t2` : pour un parrain, total des forfaits 1 et 2 attribués aux filleuls.
*/

const lch1 = ['j', 'v1', 'v1m', 'v2', 'v2m', 'f1', 'f2', 'res1', 'res2', 't1', 't2']

export class Compteurs {
  constructor (data) {
    const src = data ? deserial(data) : null
    this.j = src ? src.j : 0
    this.v1 = src ? src.v1 : 0
    this.v1m = src ? src.v1m : 0
    this.v2 = src ? src.v2 : 0
    this.v2m = src ? src.v2m : 0
    this.f1 = src ? src.f1 : 0
    this.f2 = src ? src.f2 : 0
    if (src) {
      this.tr = src.tr
      this.hist = src.hist
    } else {
      this.tr = new Array(31)
      this.tr.forEach((e, i) => { this.tr[i] = 0 })
      this.hist = new Array(12)
      this.hist.forEach((e, i) => { this.hist[i] = new Uint8Array([0, 0, 0, 0]) })
    }
    this.res1 = src ? src.res1 : 0
    this.res2 = src ? src.res2 : 0
    this.t1 = src ? src.t1 : 0
    this.t2 = src ? src.t2 : 0
  }

  get copie () {
    const c = {}
    lch1.forEach(f => { c[f] = this[f] })
    c.tr = new Array(31)
    c.tr.forEach((e, i) => { c.tr[i] = this.tr[i] })
    this.hist = new Array(12)
    c.hist.forEach((e, i) => {
      const x = new Uint8Array(4)
      for (let j = 0; j < 4; j++) x[j] = this.hist[i][j]
      c.hist[i] = x
    })
    return c
  }

  get serial () { return serial(this.copie) }
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

  get nbjmp () { return this.mm === 1 ? 31 : nbjm[this.mm - 1] + (this.aa % 4 === 0 ? 1 : 0) }

  get Date () { return new Date((j0 + this.nbj) * 86400000) }
}

export const j99 = new DateJour(new Date('2099-12-31T23:59:59')).nbj // 29220 = 365 * 80 + 20 (années bisextiles)
