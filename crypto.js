const crypto = require('crypto')
const base64url = require('base64url') // https://www.npmjs.com/package/base64url

const CRYPTO_SALT = '$2b$12$WdYsWBPznbcWrICT2tefEO'
const IV4 = new Uint8Array([101, 102, 103, 104])

export function sha256 (buffer) {
  return crypto.createHash('sha256').update(buffer).digest()
}

export function pbkfd (secret) {
  return crypto.pbkdf2Sync(secret, CRYPTO_SALT, 10000, 32, 'sha256')
}

export function random (nbytes) { return crypto.randomBytes(nbytes) }

export function bytes2Int (byteArray) {
  let value = 0
  for (let i = byteArray.length - 1; i >= 0; i--) {
    value = (value * 256) + byteArray[i]
  }
  return value
}

export function hash53 (str, seed = 0) {
  // https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return int2base64(4294967296 * (2097151 & h2) + (h1 >>> 0))
}

const c60 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
export function int2base64 (n) {
  let r = ''
  let x = n
  while (x) {
    r += c60.charAt(x % 64)
    x = Math.floor(x / 64)
  }
  return r
}

export function crypter (cle, buffer, ivfixe) {
  const k = typeof cle === 'string' ? Buffer.from(cle, 'base64') : cle
  const rnd = ivfixe ? Buffer.from(IV4) : crypto.randomBytes(4)
  const iv = Buffer.concat([rnd, rnd, rnd, rnd])
  const cipher = crypto.createCipheriv('aes-256-cbc', k, iv)
  const x1 = cipher.update(buffer)
  const x2 = cipher.final()
  return Buffer.concat([rnd, x1, x2])
}

export function decrypter (cle, buffer) {
  const k = typeof cle === 'string' ? Buffer.from(cle, 'base64') : cle
  const rnd = buffer.slice(0, 4)
  const iv = Buffer.concat([rnd, rnd, rnd, rnd])
  const decipher = crypto.createDecipheriv('aes-256-cbc', k, iv)
  return Buffer.concat([decipher.update(buffer.slice(4)), decipher.final()])
}

export function test () {
  const cle = Buffer.from('toto est beau')
  const clebin = sha256(cle)
  const cle64 = base64url(clebin)
  console.log(cle64)
  let x = pbkfd('toto est beau')
  const y = base64url(x)
  console.log(y)
  x = hash53(y)
  console.log(x)
  x = random(16)
  console.log(base64url(x))
  x = random(6)
  console.log(bytes2Int(x))
  x = Buffer.from('toto est beau toto est beau toto est beau')
  const e1 = crypter(clebin, x)
  console.log(e1.toString('hex'))
  const d1 = decrypter(clebin, e1)
  console.log(d1.toString('utf8'))
  const e2 = crypter(cle64, x, true)
  console.log(e2.toString('hex'))
  const d2 = decrypter(clebin, e2)
  console.log(d2.toString('utf8'))
  const e3 = crypter(cle64, x, true)
  console.log(e3.toString('hex'))
  const d3 = decrypter(clebin, e2)
  console.log(d3.toString('utf8'))
}
