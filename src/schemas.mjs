import { encode, decode } from '@msgpack/msgpack'
export const schemas = { forSchema, serialize, deserialize, clone }

export function serial (obj) {
  return new Uint8Array(encode(obj))
}

export function deserial (u8) {
  return decode(u8)
}

/* Gestion des schémas **************************************************/
const allTypes = {}

function forSchema (s) {
  if (s && s.name) allTypes[s.name] = s
  return s
}

function clone (s, src, dest) {
  deserialize(s, serialize(s, src), dest)
  return dest
}

function serialize (s, src) {
  const sch = allTypes[s]
  if (!sch || !sch.cols) return serial(src)
  const x = {}
  sch.cols.forEach((col) => { x[col] = src[col] })
  return serial(x)
}

function deserialize (s, buf, dest) {
  const obj = deserial(buf)
  const sch = allTypes[s]
  if (!sch || !sch.cols) {
    if (!dest) return obj
    for (const f in obj) dest[f] = obj[f]
    return dest
  }
  const x = {}
  sch.cols.forEach((col) => {
    if (dest) {
      dest[col] = obj[col]
    } else {
      x[col] = obj[col]
    }
  })
  return dest || x
}
