/*********************************************** 
IMPLEMENTATION de webcrypto.js EN UTILISANT NODE (crypto)
************************************************/
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const crypto = require('crypto')

import { toByteArray, fromByteArray } from './base64.mjs'

const dec = new TextDecoder()

import { SALTS } from './salts.mjs'

export function u8ToB64 (u8, url) {
  const s = fromByteArray(u8)
  if (!url) return s
  return s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
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

export function sha256 (buffer) {
  return crypto.createHash('sha256').update(buffer).digest()
}

export async function pbkfd (secret) {
  return crypto.pbkdf2Sync(secret, SALTS[0], 5000, 32, 'sha256')
}

export function random (nbytes) { return crypto.randomBytes(nbytes) }

export async function crypter (cle, buffer, idxIV) {
  const k = typeof cle === 'string' ? b64ToU8(cle) : cle
  const n = !idxIV ? Number(crypto.randomBytes(1)[0]) : idxIV
  const cipher = crypto.createCipheriv('aes-256-cbc', k, SALTS[n])
  const x0 = new Uint8Array(1)
  x0[0] = n
  const x1 = cipher.update(buffer)
  const x2 = cipher.final()
  return Buffer.concat([x0, x1, x2])
}

export function crypterSync (cle, buffer, idxIV) {
  const k = typeof cle === 'string' ? b64ToU8(cle) : cle
  const n = !idxIV ? Number(crypto.randomBytes(1)[0]) : idxIV
  const cipher = crypto.createCipheriv('aes-256-cbc', k, SALTS[n])
  const x0 = new Uint8Array(1)
  x0[0] = n
  const x1 = cipher.update(buffer)
  const x2 = cipher.final()
  return Buffer.concat([x0, x1, x2])
}

export async function decrypter (cle, buffer) {
  const k = typeof cle === 'string' ? b64ToU8(cle) : cle
  const decipher = crypto.createDecipheriv('aes-256-cbc', k, SALTS[Number(buffer[0])])
  const x1 = decipher.update(buffer.slice(1))
  const x2 = decipher.final()
  return Buffer.concat([x1, x2])
}

export function decrypterSync (cle, buffer) {
  const k = typeof cle === 'string' ? b64ToU8(cle) : cle
  const decipher = crypto.createDecipheriv('aes-256-cbc', k, SALTS[Number(buffer[0])])
  const x1 = decipher.update(buffer.slice(1))
  const x2 = decipher.final()
  return Buffer.concat([x1, x2])
}

export async function decrypterStr (cle, buffer) {
  const buf = decrypter(cle, buffer)
  return dec.decode(buf)
}

export async function genKeyPair () {
  return crypto.generateKeyPairSync('rsa',
    {
      modulusLength: 2048, // the length of your key in bits
      publicKeyEncoding: {
        type: 'spki', // recommended to be 'spki' by the Node.js docs
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8', // recommended to be 'pkcs8' by the Node.js docs
        format: 'pem'
        // cipher: 'aes-256-cbc',   // *optional*
        // passphrase: 'top secret' // *optional*
      }
    })
}

/* encryption RSA avec la clé publique
  data est un Buffer
const pad1 = crypto.RSA_PKCS1_OAEP_PADDING_SHA1
const pad2 = crypto.constants.RSA_PKCS1_OAEP_PADDING
const pad3 = crypto.constants.RSA_PKCS1_PADDING
*/
const pad4 = crypto.constants.RSA_NO_PADDING

export async function crypterRSA (publicKey, data) {
  return crypto.publicEncrypt({ key: publicKey /*, padding: pad3, oaepHash: 'sha256' */ }, data)
}

/* decryption RSA avec la clé privée
  encryptedData est un Buffer
*/
export async function decrypterRSA (privateKey, encryptedData) {
  // !!! Web API ne peut être décrypté que sans padding !!!
  return crypto.privateDecrypt({ key: privateKey, padding: pad4 /*, oaepHash: 'sha256' */ }, encryptedData)
}

export function concat (arrays) {
  // sum of individual array lengths
  const totalLength = arrays.reduce((acc, value) => acc + value.length, 0)
  if (!arrays.length) return null
  const result = new Uint8Array(totalLength)
  let length = 0
  for (const array of arrays) {
    result.set(array, length)
    length += array.length
  }
  return result
}

/* Tests comparatifs Web API crypto et Node crypto *********
export async function testWAC () {
  let cle = 'toto est beau'
  let clebin = await pbkfd(cle)
  console.log(u8ToB64(clebin, true))
  const clebin2 = await wcrypt.pbkfd(cle)
  const s1 = u8ToB64(clebin2, true)
  let u8 = b64ToU8(s1)
  const s2 = u8ToB64(clebin2, false)
  console.log(s1)
  console.log(s2)
  u8 = b64ToU8(s1)
  const s3 = u8ToB64(u8, false)
  console.log(s3)

  cle = enc.encode('toto est beau')
  clebin = await wcrypt.sha256(cle)
  const cle64 = u8ToB64(clebin, true)

  const sha1 = await sha256(cle)
  const sha2 = await wcrypt.sha256(cle)
  console.log(u8ToB64(sha1, true))
  console.log(u8ToB64(sha2, true))

  let x = wcrypt.random(16)
  console.log(u8ToB64(x, true))
  x = wcrypt.random(6)

  const xx = 'https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript'
  x = enc.encode(xx)
  const e1 = await crypter(clebin, x)
  console.log(e1.toString('hex'))
  const d1 = await wcrypt.decrypter(clebin, e1)
  console.log(dec.decode(d1))
  const n = Number(crypto.randomBytes(1)[0])
  const e2 = await wcrypt.crypter(cle64, x, n)
  console.log(e2.toString('hex'))
  const d2 = await decrypter(clebin, e2)
  console.log(dec.decode(d2))
  const e3 = await crypter(cle64, x, n)
  console.log(e3.toString('hex'))
  const d3 = await wcrypt.decrypter(clebin, e3)
  console.log(dec.decode(d3))

  const kp = await wcrypt.genKeyPair()
  const encRSA1 = await crypterRSA(kp.publicKey, x)
  console.log('encypted data RSA1 : ' + u8ToB64(encRSA1))
  const encRSA2 = await wcrypt.crypterRSA(kp.publicKey, x)
  console.log('encypted data RSA2 : ' + u8ToB64(encRSA2))

  const decRSA1 = await decrypterRSA(kp.privateKey, encRSA1)
  console.log('decypted data RSA2 : ' + dec.decode(decRSA1))
  const decRSA2 = await wcrypt.decrypterRSA(kp.privateKey, encRSA2)
  console.log('decypted data RSA1 : ' + dec.decode(decRSA2))

  const decRSA2b = await decrypterRSA(kp.privateKey, encRSA2)
  console.log('decypted data RSA2 : ' + dec.decode(decRSA2b))
  const decRSA1b = await wcrypt.decrypterRSA(kp.privateKey, encRSA1)
  console.log('decypted data RSA1 : ' + dec.decode(decRSA1b))
}
*/