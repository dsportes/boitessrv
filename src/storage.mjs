import { promises as fsp } from 'fs'
import fs from 'fs'
import path from 'path'
import { serial, deserial } from './schemas.mjs'
import { crypt, u8ToB64, idToSid, sidToId } from './crypto.mjs'
import { b64ToU8 } from './webcrypto.mjs'

/*
export async function getFile (cfg, org, secid, pjid) {
  try {
    const p = path.resolve(cfg.wwwdir, org, secid, pjid)
    return await fsp.readFile(p)
  } catch (err) {
    // console.log(err.toString())
    return null
  }
}

export async function putFile (cfg, org, secid, pjid, data) {
  const x = secid === 'secret1' ? 'secret2' : secid // pour test
  const dir = path.resolve(cfg.wwwdir, org, x)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  await fsp.writeFile(path.resolve(dir, pjid), data)
}
*/
/*
Si cle != null: suppression de TOUS les fichiers qui commencent par cle@ ... SAUF pjid si pjid non null
Si pjid non null et cle null : suppression DU fichier pjid (qui d'ailleurs commen,ce par cle@...)

export function delFile (cfg, org, secid, cle, pjid) {
  try {
    const dir = path.resolve(cfg.wwwdir, org, secid)
    if (fs.existsSync(dir)) {
      if (!cle) {
        fs.unlinkSync(path.resolve(dir, pjid))
      } else {
        const files = fs.readdirSync(dir)
        if (files && files.length) files.forEach(name => {
          if ((!pjid || name !== pjid) && name.startsWith(cle + '@')) fs.unlinkSync(path.resolve(dir, name));
        })
      }
    }
  } catch (err) {
    console.log(err.toString())
  }
}
*/

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
    return this.rooturl + '/' + this.encode3(org, idToSid(idacp), idToSid(idf))
  }

  async putUrl (org, idacp, idf) {
    return this.rooturl + '/' + this.encode3(org, idToSid(idacp), idToSid(idf))
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
    await fsp.writeFile(path.resolve(dir, idToSid(idf)), data)
  }

  delFiles (org, idacp, lidf) {
    if (!lidf || !lidf.length) return
    try {
      const dir = path.resolve(this.rootpath, org, idToSid(idacp))
      if (fs.existsSync(dir)) {
        for (const sidf in lidf) fs.unlinkSync(path.resolve(dir, sidf))
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
