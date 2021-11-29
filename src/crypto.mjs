import { toByteArray, fromByteArray } from './base64.mjs'

import { pbkfd, sha256, random, crypter, decrypter, decrypterStr, genKeyPair, crypterRSA, decrypterRSA, concat } from './webcrypto.mjs'

export const crypt = { pbkfd, sha256, random, crypter, decrypter, decrypterStr, genKeyPair, crypterRSA, decrypterRSA, concat, u8ToB64, b64ToU8, rnd6, hash, hashBin, int2base64, bigToU8, u8ToBig, u8ToInt, intToU8, sidToId, idToSid, test1, test2 }

export function u8ToB64 (u8, url) {
  const s = fromByteArray(u8)
  return !url ? s : s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function b64ToU8 (s) {
  const diff = s.length % 4
  let x = s
  if (diff) {
    const pad = '===='.substring(0, 4 - diff)
    x = s + pad
  }
  return toByteArray(x.replace(/-/g, '+').replace(/_/g, '/'))
}

function rnd6 () { return u8ToInt(random(6)) }

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
  if (Number.isSafeInteger(r)) {
    console.log(r)
  }
  return b64 ? int2base64(r) : r
}

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

function writeUInt32LE (u8, value, offset) {
  value = +value
  offset = offset >>> 0
  u8[offset + 3] = (value >>> 24)
  u8[offset + 2] = (value >>> 16)
  u8[offset + 1] = (value >>> 8)
  u8[offset] = (value & 0xff)
  return offset + 4
}

const max32 = BigInt(2 ** 32)
function bigToU8 (n) {
  if (typeof n === 'number') n = BigInt(n)
  if (n < 0) n = -n
  const buf = new Uint8Array(8)
  writeUInt32LE(buf, Number(n / max32), 4)
  writeUInt32LE(buf, Number(n % max32), 0)
  return buf
}

function readUInt32LE (u8, offset) {
  offset = offset >>> 0
  return ((u8[offset]) |
      (u8[offset + 1] << 8) |
      (u8[offset + 2] << 16)) +
      (u8[offset + 3] * 0x1000000)
}

const BI_MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER)
function u8ToBig (u8, number = false) {
  const fort = BigInt(readUInt32LE(u8, 4))
  const faible = BigInt(readUInt32LE(u8, 0))
  const r = (fort * max32) + faible
  return number && r < BI_MAX_SAFE_INTEGER ? Number(r) : r
}

function u8ToInt (u8) {
  if (!u8 || !u8.length || u8.length > 8) return 0
  let r = 0n
  for (let i = u8.length - 1; i > 0; i--) {
    r += BigInt(u8[i]) * (p2b[i - 1] + 1n)
  }
  r += BigInt(u8[0])
  return r > BI_MAX_SAFE_INTEGER ? r : Number(r)
}

const p2 = [255, (256 ** 2) - 1, (256 ** 3) - 1, (256 ** 4) - 1, (256 ** 5) - 1, (256 ** 6) - 1, (256 ** 7) - 1]
const p2b = [255n, (256n ** 2n) - 1n, (256n ** 3n) - 1n, (256n ** 4n) - 1n, (256n ** 5n) - 1n, (256n ** 6n) - 1n, (256n ** 7n) - 1n]
function intToU8 (n) {
  const bi = typeof n === 'bigint'
  if (n < 0) n = -n
  const p2x = bi ? p2b : p2
  let l = 8
  for (let i = 6; i >= 0; i--, l--) if (n > p2x[i]) break
  const u8 = new Uint8Array(l)
  for (let i = 0; i < 8; i++) {
    u8[i] = bi ? Number(n % 256n) : n % 256
    n = bi ? (n / 256n) : Math.floor(n / 256)
  }
  return u8
}

function sidToId (id) {
  return u8ToInt(b64ToU8(id, true)) // b64 -> buffer
}

function idToSid (id) { // to string (b64)
  if (typeof id === 'string') return id // déjà en B64
  if (typeof id === 'number') return u8ToB64(intToU8(id), true) // int -> u8 -> b64
  return u8ToB64(id, true) // u8 -> b64
}

async function test1 () {
  const xx = 'https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript'
  console.log(int2base64(12345678))
  console.log(int2base64(12345678n))
  console.log(hash(xx, false, false))
  console.log(hash(xx, false, true))
  console.log(hash(xx, true, false))
  console.log(hash(xx, true, true))
  let z = hash(xx, false)
  console.log(z)
  const b1 = bigToU8(z)
  console.log(u8ToB64(b1, true))
  console.log(u8ToBig(b1))
  z = hash(xx, true)
  console.log(z)
  const b2 = bigToU8(z)
  console.log(u8ToB64(b2, true))
  console.log(u8ToBig(b2, true))
  console.log(u8ToBig(b2))
  console.log(b1.length + ' - ' + b2.length)

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
    v7 = bigToU8(m7)
    j7 = u8ToBig(v7)
  }
  const t3 = new Date().getTime()
  console.log((t3 - t2) + 'ms')
  console.log('u7 ' + hashBin(u7))
  console.log('v7 ' + hashBin(v7))

  const u5 = intToU8(m5)
  const v5 = bigToU8(m5b)
  const i5 = u8ToInt(u5)
  const j5 = u8ToBig(v5)
  console.log('u5 ' + hashBin(u5))
  console.log('v5 ' + hashBin(v5))

  const u1 = intToU8(m1)
  const v1 = bigToU8(10n)
  const i1 = u8ToInt(u1)
  const j1 = u8ToBig(v1)
  console.log('u1 ' + hashBin(u1))
  console.log('v1 ' + hashBin(v1))

  console.log(m7 + ' ' + u7.toString('hex') + ' ' + v7.toString('hex') + ' ' + i7 + ' ' + j7)
  console.log(m5 + ' ' + u5.toString('hex') + ' ' + v5.toString('hex') + ' ' + i5 + ' ' + j5)
  console.log(m1 + ' ' + u1.toString('hex') + ' ' + v1.toString('hex') + ' ' + i1 + ' ' + j1)
}

async function test2 () {
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  let cle = 'toto est beau'
  const clebin2 = await crypt.pbkfd(cle)
  const s1 = u8ToB64(clebin2, true)
  let u8 = b64ToU8(s1)
  const s2 = u8ToB64(clebin2, false)
  console.log(s1)
  console.log(s2)
  u8 = b64ToU8(s1)
  const s3 = u8ToB64(u8, false)
  console.log(s3)

  cle = enc.encode('toto est beau')
  const clebin = crypt.sha256(cle)
  console.log(u8ToB64(clebin, true))

  const sha2 = crypt.sha256(cle)
  console.log(u8ToB64(sha2, true))

  let x = crypt.random(16)
  console.log(u8ToB64(x, true))
  x = crypt.random(6)
  const xx = 'https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript'
  x = enc.encode(xx)
  const e1 = await crypt.crypter(clebin, x)
  console.log(e1.toString('hex'))
  const d1 = await crypt.decrypter(clebin, e1)
  console.log(dec.decode(d1))
  const y = crypt.random(1)
  const n = Number(y[0])
  const e2 = await crypt.crypter(clebin, x, n)
  console.log(e2.toString('hex'))
  const d2 = await crypt.decrypter(clebin, e2)
  console.log(dec.decode(d2))
  const e3 = await crypt.crypter(clebin, x, n)
  console.log(e3.toString('hex'))
  const d3 = await crypt.decrypter(clebin, e3)
  console.log(dec.decode(d3))

  const kp = await crypt.genKeyPair()
  const encRSA2 = await crypt.crypterRSA(kp.publicKey, x)
  console.log('encypted data RSA2 : ' + u8ToB64(encRSA2))
  const decRSA2 = await crypt.decrypterRSA(kp.privateKey, encRSA2)
  console.log('decypted data RSA1 : ' + dec.decode(decRSA2))
}
