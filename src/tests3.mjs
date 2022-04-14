/*
Root:
MINIO_ROOT_USER : minioadmin
MINIO_ROOT_PASSWORD : minioadmin

endPoint: 'play.min.io'
port: 9000
AccessKey : Q3AM3UQ867SPQQA43P2F
SecretKey : zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG

Alias : access-boites
AccessKey : access-boites
Secret-Key: secret-boites

Buckets :
boites
*/

function stream2buffer(stream) {
  return new Promise((resolve, reject) => {
    const _buf = []
    stream.on('data', (chunk) => _buf.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(_buf)))
    stream.on('error', (err) => reject(err))
  })
} 

/*
BUG de AWS S3 client v3 sur getSignedUrl relevé par minio : https://github.com/minio/minio/issues/11743
Contournement OK fourni par AWS S3 client : https://github.com/aws/aws-sdk-js-v3/issues/2121
Les import de createRequest Hash et formatUrl découle du besoin de signer une request (et non plus juste une commande)
*/

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { /* getSignedUrl, */ S3RequestPresigner } from '@aws-sdk/s3-request-presigner'
import { createRequest } from '@aws-sdk/util-create-request'
import { Hash } from '@aws-sdk/hash-node'
import { formatUrl } from '@aws-sdk/util-format-url'
import fetch from 'node-fetch'

const config = {
  credentials: {
    // accessKeyId: 'Q3AM3UQ867SPQQA43P2F',
    // secretAccessKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
    accessKeyId: 'access-boites',
    secretAccessKey: 'secret-boites'
  },
  // endpoint: 'https://play.min.io:9000',
  endpoint: 'http://192.168.1.10:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  signatureVersion: 'v4'
}
const s3 = new S3Client(config)
config.sha256 = Hash.bind(null, 'sha256')
const signer = new S3RequestPresigner(config)

const bucketName = 'boites';

(async () => {
  try {
    const objectKey = 'first-entry.txt'
    const bucketParams = { Bucket: bucketName, Key: objectKey, Body: 'Hello there again 4' }
    const putCmd = new PutObjectCommand(bucketParams)
    // await s3.send(putCmd) // ça marche : mais on peut aussi utiliser l'url signée ce qui est l'objectif ici

    // const putUrl = await getSignedUrl(s3, putCmd, { expiresIn: 3600 }) // KO : voir bug ci-dessus
    const putReq = await createRequest(s3, putCmd)
    // Append the port to generate a valid signature. // contournement proposé par S3
    putReq.headers.host = `${ putReq.hostname }:${ putReq.port }`
    const url1 = await signer.presign(putReq)
    const putUrl = formatUrl(url1)
    console.log('putURL:' + putUrl)

    console.log(`\nPutting "${bucketParams.Key}" using signedUrl with body "${bucketParams.Body}" in v3`)
    const response = await fetch(putUrl, {method: 'PUT', body: bucketParams.Body})
    console.log(`\nResponse returned by signed URL: ${await response.text()}\n`)

    const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: objectKey })
    const res = await s3.send(getCmd)
    const buffer = await stream2buffer(res.Body)
    console.log('Lecture OK: ' + buffer.length)
    console.log(buffer.toString())
    // const url2 = await getSignedUrl(s3, getCmd, { expiresIn: 3600 }) // KO : voir bug ci-dessus
    // console.log('URL:' + url2)

    const getReq = await createRequest(s3, getCmd)
    // Append the port to generate a valid signature.
    getReq.headers.host = `${ getReq.hostname }:${ getReq.port }`
    const url2 = await signer.presign(getReq)
    const getUrl = formatUrl(url2)
    console.log('getURL:' + getUrl)

    const resGet = await fetch(getUrl)
    const buf = await resGet.arrayBuffer()
    console.log(buf.length)

  } catch (err) {
    console.log('Error', err)
  }
})()
