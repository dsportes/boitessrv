import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const fs = require('fs')
const path = require('path')

import { cryptersoft, decryptersoft } from './webcrypto.mjs'

const configjson = fs.readFileSync(path.resolve('./config/config.json'))
const crypt = cryptersoft(configjson)
fs.writeFileSync(path.resolve('./config/config.bin'), crypt)

const dcrypt = decryptersoft(crypt)
const configjson2 = new TextDecoder().decode(dcrypt)
if (configjson2 === configjson.toString()) console.log('OK')
