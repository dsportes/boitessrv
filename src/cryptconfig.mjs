import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const fs = require('fs')
const path = require('path')

import { crypterSync, decrypterSync } from './webcrypto.mjs'
import { ALLSALTS } from './salts.mjs'

const localkey = ALLSALTS.slice(32, 64)

const configjson = fs.readFileSync(path.resolve('./config/config.json'))
const crypt = crypterSync(localkey, configjson, 1)
fs.writeFileSync(path.resolve('./config/config.bin'), crypt)

const dcrypt = decrypterSync(localkey, crypt)
const configjson2 = new TextDecoder().decode(dcrypt)
if (configjson2 === configjson.toString()) console.log('OK')
