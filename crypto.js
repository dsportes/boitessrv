const crypto = require('crypto')
const base64url = require('base64url') // https://www.npmjs.com/package/base64url

const CRYPTO_SALT = '$2b$12$WdYsWBPznbcWrICT2tefEO'
const IV4 = new Uint8Array([101, 102, 103, 104])

function sha256 (buffer) {
  return crypto.createHash('sha256').update(buffer).digest()
}
exports.sha256 = sha256

function pbkfd (secret) {
  return crypto.pbkdf2Sync(secret, CRYPTO_SALT, 5000, 32, 'sha256')
}
exports.pbkfd = pbkfd

function random (nbytes) { return crypto.randomBytes(nbytes) }
exports.random = random

function bytes2Int (byteArray) {
  let value = 0
  for (let i = byteArray.length - 1; i >= 0; i--) {
    value = (value * 256) + byteArray[i]
  }
  return value
}
exports.bytes2Int = bytes2Int

function hash (str, big = false, b64 = false, seed = 0) {
  // https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const r = big ? 4294967296n * BigInt(h2) + BigInt(h1) : 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return b64 ? int2base64(r) : r
}
exports.hash = hash

const c64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function int2base64 (n) {
  let r = '', x = n, i
  const b = typeof n !== 'number'
  while (x) {
    i = b ? Number(x % 64n) : x % 64
    r += c64.charAt(i < 0 ? -i : i)
    x = b ? x / 64n : Math.floor(x / 64)
  }
  return r
}
exports.int2base64 = int2base64

function int2u8 (n) {
  let hex = n.toString(16)
  if (hex.length % 2) { hex = '0' + hex }
  const len = hex.length / 2
  const u8 = new Uint8Array(len)
  let i = 0, j = 0
  while (i < len) {
    u8[i] = parseInt(hex.slice(j, j + 2), 16)
    i += 1
    j += 2
  }
  return u8
}
exports.int2u8 = int2u8

function u82int (u8, big = false) {
  const hex = []
  u8.forEach(i => {
    let h = i.toString(16)
    if (h.length % 2) { h = '0' + h }
    hex.push(h)
  })
  return big ? BigInt('0x' + hex.join('')) : parseInt(hex, 16)
}
exports.u82int = u82int

function crypter (cle, buffer, ivfixe) {
  const k = typeof cle === 'string' ? Buffer.from(cle, 'base64') : cle
  const rnd = ivfixe ? Buffer.from(IV4) : crypto.randomBytes(4)
  const iv = Buffer.concat([rnd, rnd, rnd, rnd])
  const cipher = crypto.createCipheriv('aes-256-cbc', k, iv)
  const x1 = cipher.update(buffer)
  const x2 = cipher.final()
  return Buffer.concat([rnd, x1, x2])
}
exports.crypter = crypter

function decrypter (cle, buffer) {
  const k = typeof cle === 'string' ? Buffer.from(cle, 'base64') : cle
  const rnd = buffer.slice(0, 4)
  const iv = Buffer.concat([rnd, rnd, rnd, rnd])
  const decipher = crypto.createDecipheriv('aes-256-cbc', k, iv)
  return Buffer.concat([decipher.update(buffer.slice(4)), decipher.final()])
}
exports.decrypter = decrypter

function test () {
  const cle = Buffer.from('toto est beau')
  const clebin = sha256(cle)
  const cle64 = base64url(clebin)
  console.log(cle64)
  let x = pbkfd('toto est beau')
  const y = base64url(x)
  console.log(y)
  x = random(16)
  console.log(base64url(x))
  x = random(6)
  console.log(bytes2Int(x))
  const xx = 'https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript'
  x = Buffer.from(xx)
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

  console.log(int2base64(12345678))
  console.log(int2base64(12345678n))
  console.log(hash(xx, false, false))
  console.log(hash(xx, false, true))
  console.log(hash(xx, true, false))
  console.log(hash(xx, true, true))
  let z = hash(xx, false)
  console.log(z)
  const b1 = int2u8(z)
  console.log(base64url(b1))
  console.log(u82int(b1))
  z = hash(xx, true)
  const b2 = int2u8(z)
  console.log(base64url(b2))
  console.log(u82int(b2, true))
  console.log(b1.length + ' - ' + b2.length)
}
exports.test = test
