const avro = require('avsc')

/* Gestion Bigint **************************************************/
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
exports.bigToU8 = bigToU8

function readUInt32LE (u8, offset) {
  offset = offset >>> 0
  return ((u8[offset]) |
      (u8[offset + 1] << 8) |
      (u8[offset + 2] << 16)) +
      (u8[offset + 3] * 0x1000000)
}

function u8ToBig (u8, number = false) {
  const fort = BigInt(readUInt32LE(u8, 4))
  const faible = BigInt(readUInt32LE(u8, 0))
  const r = (fort * max32) + faible
  return !number ? r : Number(r)
}
exports.u8ToBig = u8ToBig

avro.types.LongType.__with({
  fromBuffer: buf => u8ToBig(buf),
  toBuffer: n => bigToU8(n < 0 ? -n : n),
  fromJSON: Number,
  toJSON: Number,
  isValid: n => typeof n === 'bigint',
  compare: (n1, n2) => n1 === n2 ? 0 : (n1 < n2 ? -1 : 1)
})

/* Gestion des schémas **************************************************/
const allTypes = {}

function getType (name) {
  return name && typeof name === 'string' ? allTypes[name] : null
}
exports.getType = getType

function ab2b (x) {
  return Buffer.from(x)
}
exports.ab2b = ab2b

function forSchema (s) {
  const sch = avro.Type.forSchema(s)
  if (s && s.name) allTypes[s.name] = sch
  return sch
}
exports.forSchema = forSchema

function serialize (s, obj) {
  const sch = getType(s) || s
  return sch.toBuffer(obj)
}
exports.serialize = serialize

function deserialize (s, buf) {
  const sch = getType(s) || s
  return sch.fromBuffer(buf)
}
exports.deserialize = deserialize
