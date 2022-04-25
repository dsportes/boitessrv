import { promises as fsp } from 'fs'
import fs from 'fs'
import path from 'path'
import { serial, deserial } from './schemas.mjs'
import { crypt, u8ToB64, idToSid, sidToId } from './crypto.mjs'
import { b64ToU8 } from './webcrypto.mjs'

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3'
import { /* getSignedUrl, */ S3RequestPresigner } from '@aws-sdk/s3-request-presigner'
import { createRequest } from '@aws-sdk/util-create-request'
import { Hash } from '@aws-sdk/hash-node'
import { formatUrl } from '@aws-sdk/util-format-url'

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

  async delFiles (org, idacp, lidf) {
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

  async delACP (org, idacp) {
    try {
      const dir = path.resolve(this.rootpath, org, idToSid(idacp))
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      console.log(err.toString())
    }
  }

  async listFiles (org, idacp) {
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

  async listACP (org) {
    try {
      const lst = []
      const dir = path.resolve(this.rootpath, org)
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
  constructor (config) {
    this.config = config.s3
    this.s3 = new S3Client(this.config)
    this.config.sha256 = Hash.bind(null, 'sha256')
    this.signer = new S3RequestPresigner(this.config)
    this.bucketName = config.bucket
  }

  async getFile (org, idacp, idf) {
    try {
      const objectKey = '/' + org + '/' + idToSid(idacp) + '/' + idToSid(idf)
      const getCmd = new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey })
      const res = await this.s3.send(getCmd)
      return await stream2buffer(res.Body)
    } catch (err) {
      // console.log(err.toString())
      return null
    }
  }

  async putFile (org, idacp, idf, data) {
    const objectKey = '/' + org + '/' + idToSid(idacp) + '/' + idToSid(idf)
    const bucketParams = { Bucket: this.bucketName, Key: objectKey, Body: data }
    const putCmd = new PutObjectCommand(bucketParams)
    await this.s3.send(putCmd)
  }

  async getUrl (org, idacp, idf) {
    const objectKey = '/' + org + '/' + idToSid(idacp) + '/' + idToSid(idf)
    const getCmd = new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey })
    const getReq = await createRequest(this.s3, getCmd)
    // Append the port to generate a valid signature.
    getReq.headers.host = `${ getReq.hostname }:${ getReq.port }`
    const url = await this.signer.presign(getReq)
    const getUrl = formatUrl(url)
    // console.log('getURL:' + getUrl)
    return getUrl
  }

  async putUrl (org, idacp, idf) {
    const objectKey = '/' + org + '/' + idToSid(idacp) + '/' + idToSid(idf)
    const putCmd = new PutObjectCommand({ Bucket: this.bucketName, Key: objectKey })
    // const putUrl = await getSignedUrl(s3, putCmd, { expiresIn: 3600 }) // KO : voir bug ci-dessus
    const putReq = await createRequest(this.s3, putCmd)
    // Append the port to generate a valid signature. // contournement proposé par S3
    putReq.headers.host = `${ putReq.hostname }:${ putReq.port }`
    const url = await this.signer.presign(putReq)
    const putUrl = formatUrl(url)
    // console.log('putURL:' + putUrl)
    return putUrl
  }

  async delFiles (org, idacp, lidf) {
    if (!lidf || !lidf.length) return
    try {
      for (let i = 0; i < lidf.length; i++) {
        const objectKey = '/' + org + '/' + idToSid(idacp) + '/' + idToSid(lidf[i])
        const delCmd = new DeleteObjectCommand({ Bucket: this.bucketName, Key: objectKey })
        await this.s3.send(delCmd)
      }
    } catch (err) {
      console.log(err.toString())
    }
  }

  async delACP (org, idacp) {
    const lst = []
    const bucketParams = { Bucket: this.bucketName, Prefix: org + '/' + idToSid(idacp) + '/', Delimiter: '/', MaxKeys: 10000 }
    let truncated = true
    while (truncated) {
      const response = await this.s3.send(new ListObjectsCommand(bucketParams))
      if (response.Contents) response.Contents.forEach((item) => { lst.push(item.Key) })
      truncated = response.IsTruncated
      if (truncated) bucketParams.Marker = response.NextMarker
    }
    for (let i = 0; i < lst.length; i++) {
      const delCmd = new DeleteObjectCommand({ Bucket: this.bucketName, Key: lst[i] })
      await this.s3.send(delCmd)
    }
  }

  async listFiles (org, idacp) {
    const lst = []
    const pfx = org + '/' + idToSid(idacp) + '/'
    const l = pfx.length
    const bucketParams = { Bucket: this.bucketName, Prefix: pfx, Delimiter: '/', MaxKeys: 10000 }
    let truncated = true
    while (truncated) {
      const response = await this.s3.send(new ListObjectsCommand(bucketParams))
      if (response.Contents) response.Contents.forEach((item) => {
        const s = item.Key
        const s2 = s.substring(l, s.length - 1)
        lst.push(sidToId(s2))
      })
      truncated = response.IsTruncated
      if (truncated) bucketParams.Marker = response.NextMarker
    }
    return lst
  }

  async listACP (org) {
    const lst = []
    const l = (org + '/').length
    const bucketParams = { Bucket: this.bucketName, Prefix: org + '/', Delimiter: '/', MaxKeys: 10000 }
    let truncated = true
    while (truncated) {
      const response = await this.s3.send(new ListObjectsCommand(bucketParams))
      if (response.CommonPrefixes) response.CommonPrefixes.forEach((item) => {
        const s = item.Prefix
        const s2 = s.substring(l, s.length - 1)
        lst.push(sidToId(s2))
      })
      truncated = response.IsTruncated
      if (truncated) bucketParams.Marker = response.NextMarker
    }
    return lst
  }

}

function stream2buffer(stream) {
  return new Promise((resolve, reject) => {
    const _buf = []
    stream.on('data', (chunk) => _buf.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(_buf)))
    stream.on('error', (err) => reject(err))
  })
}
