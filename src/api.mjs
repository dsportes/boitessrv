import { schemas } from './schemas.mjs'

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

- `compte` (id) : authentification et données d'un compte
- `avatar` (id) : données d'un avatar et liste de ses contacts
- `invitgr` (id, ni) : invitation reçue par un avatar à devenir membre d'un groupe
- `contact` (id, nc) : données d'un contact d'un avatar
- `rencontre` (prh) id : communication par A de son nom complet à un avatar B non connu de A dans l'application
- `parrain` (pph) id : parrainage par un avatar A de la création d'un nouveau compte
- `groupe` (id) : données du groupe et liste de ses avatars, invités ou ayant été pressentis, un jour à être membre.
- `membre` (id, im) : données d'un membre du groupe
- `secret` (id, ns) : données d'un secret d'un avatar ou groupe
*/

schemas.forSchema({
  name: 'rowavatar',
  cols: ['id', 'v', 'st', 'vcv', 'dds', 'cva', 'lgrk', 'vsh']
})

schemas.forSchema({
  name: 'rowavgrq',
  cols: ['id', 'q1', 'q2', 'qm1', 'qm2', 'v1', 'v2', 'vm1', 'vm2', 'vsh']
})

schemas.forSchema({
  name: 'rowavrsa',
  cols: ['id', 'clepub', 'vsh']
})

schemas.forSchema({
  name: 'rowcompte',
  cols: ['id', 'v', 'dds', 'dpbh', 'pcbh', 'kx', 'mack', 'vsh']
})

schemas.forSchema({
  name: 'rowprefs',
  cols: ['id', 'v', 'mapk', 'vsh']
})

schemas.forSchema({
  name: 'rowcontact',
  cols: ['id', 'ic', 'v', 'st', 'q1', 'q2', 'qm1', 'qm2', 'ardc', 'datap', 'datak', 'mc', 'infok', 'vsh']
})

schemas.forSchema({
  name: 'rowgroupe',
  cols: ['id', 'v', 'dds', 'st', 'stxy', 'cvg', 'mcg', 'vsh']
})

schemas.forSchema({
  name: 'rowinvitgr',
  cols: ['id', 'ni', 'datap']
})

schemas.forSchema({
  name: 'rowmembre',
  cols: ['id', 'im', 'v', 'st', 'vote', 'q1', 'q2', 'mc', 'infok', 'datag', 'ardg', 'vsh']
})

schemas.forSchema({
  name: 'rowparrain',
  cols: ['pph', 'id', 'v', 'dlv', 'st', 'q1', 'q2', 'qm1', 'qm2', 'datak', 'datax', 'data2k', 'ardc', 'vsh']
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
