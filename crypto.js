const crypto = require('crypto')
const base64url = require('base64url') // https://www.npmjs.com/package/base64url

const SALTS = new Array(256)
function setSalts (a) {
  const b = Buffer.from(a)
  for (let i = 0; i < 256; i++) {
    SALTS[i] = Uint8Array.prototype.slice.call(b, i * 16, (i + 1) * 16)
  }
  return SALTS
}
exports.setSalts = setSalts

function sha256 (buffer) {
  return crypto.createHash('sha256').update(buffer).digest()
}
exports.sha256 = sha256

function pbkfd (secret) {
  return crypto.pbkdf2Sync(secret, SALTS[0], 5000, 32, 'sha256')
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

function hashBin (str, big = false, b64 = false, seed = 0) {
  // https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str[i]
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const r = big ? 4294967296n * BigInt(h2) + BigInt(h1) : 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return b64 ? int2base64(r) : r
}
exports.hashBin = hashBin

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

const max32 = BigInt(2 ** 32)
function big2u8 (n) {
  if (typeof n === 'number') n = BigInt(n)
  if (n < 0) n = -n
  const buf = Buffer.alloc(8)
  buf.writeUInt32LE(Number(n / max32), 4)
  buf.writeUInt32LE(Number(n % max32), 0)
  return buf
}
exports.big2u8 = big2u8

function u82big (u8, number = false) {
  const fort = BigInt(u8.readUInt32LE(4))
  const faible = BigInt(u8.readUInt32LE(0))
  const r = (fort * max32) + faible
  return !number ? r : Number(r)
}
exports.u82big = u82big

function u8ToInt (u8) {
  if (!u8 || !u8.length || u8.length > 8) return 0
  const bi = u8.length > 6
  let r = bi ? 0n : 0
  for (let i = u8.length - 1; i > 0; i--) {
    r += bi ? BigInt(u8[i]) * (p2b[i - 1] + 1n) : u8[i] * (p2[i - 1] + 1)
  }
  return r + (bi ? BigInt(u8[0]) : u8[0])
}
exports.u8ToInt = u8ToInt

const p2 = [255, (256 ** 2) - 1, (256 ** 3) - 1, (256 ** 4) - 1, (256 ** 5) - 1, (256 ** 6) - 1, (256 ** 7) - 1]
const p2b = [255n, (256n ** 2n) - 1n, (256n ** 3n) - 1n, (256n ** 4n) - 1n, (256n ** 5n) - 1n, (256n ** 6n) - 1n, (256n ** 7n) - 1n]
function intToU8 (n) {
  const bi = typeof n === 'bigint'
  if (n < 0) n = -n
  const p2x = bi ? p2b : p2
  let l = 8
  for (let i = 6; i >= 0; i--, l--) if (n > p2x[i]) break
  const u8 = Buffer.alloc(l)
  for (let i = 0; i < 8; i++) {
    u8[i] = bi ? Number(n % 256n) : n % 256
    n = bi ? (n / 256n) : Math.floor(n / 256)
  }
  return u8
}
exports.intToU8 = intToU8

function crypter (cle, buffer, idxIV) {
  const k = typeof cle === 'string' ? Buffer.from(cle, 'base64') : cle
  const n = !idxIV ? 0 : (idxIV < 0 ? Number(crypto.randomBytes(1)) : idxIV)
  const cipher = crypto.createCipheriv('aes-256-cbc', k, SALTS[n])
  const x1 = cipher.update(buffer)
  const x2 = cipher.final()
  return Buffer.concat([Buffer.from([n]), x1, x2])
}
exports.crypter = crypter

function decrypter (cle, buffer) {
  const k = typeof cle === 'string' ? Buffer.from(cle, 'base64') : cle
  const decipher = crypto.createDecipheriv('aes-256-cbc', k, SALTS[Number(buffer[0])])
  return Buffer.concat([decipher.update(buffer.slice(1)), decipher.final()])
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
  const n = Number(crypto.randomBytes(1)[0])
  const e2 = crypter(cle64, x, n)
  console.log(e2.toString('hex'))
  const d2 = decrypter(clebin, e2)
  console.log(d2.toString('utf8'))
  const e3 = crypter(cle64, x, n)
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
  const b1 = big2u8(z)
  console.log(base64url(b1))
  console.log(u82big(b1))
  z = hash(xx, true)
  const b2 = big2u8(z)
  console.log(base64url(b2))
  console.log(u82big(b2, true))
  console.log(b1.length + ' - ' + b2.length)
}
exports.test = test

function test2 () {
  // const m7 = p2b[6] + 10n
  const m7 = (2n ** 64n) - 1n
  const m5 = p2[4] + 10
  const m5b = p2b[4] + 10n
  const m1 = 10
  let u7, v7, i7, j7
  const t1 = new Date().getTime()
  for (let i = 0; i < 1000; i++) {
    u7 = intToU8(m7)
    i7 = u8ToInt(u7)
  }
  const t2 = new Date().getTime()
  console.log((t2 - t1) + 'ms')
  for (let i = 0; i < 1000; i++) {
    v7 = big2u8(m7)
    j7 = u82big(v7)
  }
  const t3 = new Date().getTime()
  console.log((t3 - t2) + 'ms')
  console.log('u7 ' + hashBin(u7))
  console.log('v7 ' + hashBin(v7))

  const u5 = intToU8(m5)
  const v5 = big2u8(m5b)
  const i5 = u8ToInt(u5)
  const j5 = u82big(v5)
  console.log('u5 ' + hashBin(u5))
  console.log('v5 ' + hashBin(v5))

  const u1 = intToU8(m1)
  const v1 = big2u8(10n)
  const i1 = u8ToInt(u1)
  const j1 = u82big(v1)
  console.log('u1 ' + hashBin(u1))
  console.log('v1 ' + hashBin(v1))

  console.log(m7 + ' ' + u7.toString('hex') + ' ' + v7.toString('hex') + ' ' + i7 + ' ' + j7)
  console.log(m5 + ' ' + u5.toString('hex') + ' ' + v5.toString('hex') + ' ' + i5 + ' ' + j5)
  console.log(m1 + ' ' + u1.toString('hex') + ' ' + v1.toString('hex') + ' ' + i1 + ' ' + j1)
}
exports.test2 = test2
