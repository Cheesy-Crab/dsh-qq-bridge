import fs from 'node:fs'
import path from 'node:path'

const roots = ['package.json']
for (const file of roots) {
  const bytes = fs.readFileSync(file)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    console.error(`${file}: UTF-8 BOM is not allowed`)
    process.exit(1)
  }
  JSON.parse(bytes.toString('utf8'))
}
const src = path.join('src')
for (const entry of fs.readdirSync(src, { recursive: true })) {
  const file = path.join(src, String(entry))
  if (!file.endsWith('.json')) continue
  const bytes = fs.readFileSync(file)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    console.error(`${file}: UTF-8 BOM is not allowed`)
    process.exit(1)
  }
  JSON.parse(bytes.toString('utf8'))
}
console.log('package.json: ok')
