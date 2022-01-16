import { promises as fsp } from 'fs'
import fs from 'fs'
import path from 'path'

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

export function delFile (cfg, org, secid, cle, pjid) {
  try {
    const dir = path.resolve(cfg.wwwdir, org, secid)
    if (fs.existsSync(dir)) {
      if (!cle) {
        fs.unlinkSync(path.resolve(dir, pjid))
      } else {
        const files = fs.readdirSync(dir)
        if (files && files.length) files.forEach(name => {
          if (name !== pjid && name.startsWith(cle + '@')) fs.unlinkSync(path.resolve(dir, name));
        })
      }
    }
  } catch (err) {
    console.log(err.toString())
  }
}
