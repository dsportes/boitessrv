import { promises as fsp } from 'fs'
import fs from 'fs'
import path from 'path'
import { serial, deserial } from './schemas.mjs'
import { crypt, u8ToB64, idToSid, sidToId } from './crypto.mjs'
import { b64ToU8 } from './webcrypto.mjs'

export class FsProvider {
  constructor (config) {
    this.rootpath = config.rootpath
    this.rooturl = config.rooturl
  }

  encode3 (org, idacp, idf) {
    return u8ToB64(crypt.cryptersoft(serial([org, idToSid(idacp), idToSid(idf)])), true)
  }

  decode3 (arg) { // retourne [org, idacp, idf]
    return deserial(crypt.decryptersoft(b64ToU8(arg)))
  }

  async getUrl (org, idacp, idf) {
    return this.rooturl + '/storage/' + this.encode3(org, idToSid(idacp), idToSid(idf))
  }

  async putUrl (org, idacp, idf) {
    return this.rooturl + '/storage/' + this.encode3(org, idToSid(idacp), idToSid(idf))
  }

  async getFile (org, idacp, idf) {
    try {
      const p = path.resolve(this.rootpath, org, idToSid(idacp), idToSid(idf))
      return await fsp.readFile(p)
    } catch (err) {
      // console.log(err.toString())
      return null
    }
  }

  async putFile (org, idacp, idf, data) {
    const dir = path.resolve(this.rootpath, org, idToSid(idacp))
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const p = path.resolve(dir, idToSid(idf))
    await fsp.writeFile(p, Buffer.from(data))
  }

  delFiles (org, idacp, lidf) {
    if (!lidf || !lidf.length) return
    try {
      const dir = path.resolve(this.rootpath, org, idToSid(idacp))
      if (fs.existsSync(dir)) {
        for (let i = 0; i < lidf.length; i++) fs.unlinkSync(path.resolve(dir, idToSid(lidf[i])))
      }
    } catch (err) {
      console.log(err.toString())
    }
  }

  delDir (org, idacp) {
    try {
      const dir = path.resolve(this.rootpath, org, idToSid(idacp))
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      console.log(err.toString())
    }
  }

  listDir (org, idacp) { // utilité ?
    try {
      const lst = []
      const dir = path.resolve(this.rootpath, org, idacp)
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        if (files && files.length) files.forEach(name => { lst.push(sidToId(name)) })
      }
      return lst
    } catch (err) {
      console.log(err.toString())
    }
  }
  
}

export class S3Provider {
  constructor (/* config */) {
  }
}
