// Usage: bun scripts/update-manifest.js <version> <apkUrl> <sizeMb> <releasedAt> <notes...>
// Rewrites web/src/download.json (bump buildNumber, mark live).
const fs = require('fs')
const path = require('path')

const [version, apkUrl, sizeMb, releasedAt, ...noteParts] = process.argv.slice(2)
const notes = noteParts.join(' ')
if (!version || !apkUrl || !sizeMb || !releasedAt || !notes) {
  console.error('usage: bun scripts/update-manifest.js <version> <apkUrl> <sizeMb> <releasedAt> <notes>')
  process.exit(1)
}

const p = path.join(__dirname, '..', '..', 'web', 'src', 'download.json')
const m = JSON.parse(fs.readFileSync(p, 'utf8'))
m.version = version
m.buildNumber = (m.buildNumber || 0) + 1
m.releasedAt = releasedAt
m.apkUrl = apkUrl
m.sizeMb = parseFloat(sizeMb)
m.notes = notes
m.status = 'live'
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n')
console.log(JSON.stringify(m, null, 2))
