import { serial, deserial } from './util.mjs'
export const schemas = { forSchema, serialize, deserialize, test }

/* Gestion des schémas **************************************************/
const allTypes = {}

function forSchema (s) {
  if (s && s.name) allTypes[s.name] = s
  return s
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

function test () {
  const sch = { name: 'test', cols: ['nom', 'age'] }
  const obj1 = { nom: 'Daniel', age: 62, taille: 182 }

  forSchema(sch)
  const buf2 = serialize('test', obj1)
  const obj2b = deserialize('test', buf2)
  console.log(JSON.stringify(obj2b))
}
