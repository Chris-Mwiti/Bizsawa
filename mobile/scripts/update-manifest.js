// Usage: bun scripts/update-manifest.js <version> <apkUrl> <sizeMb> <releasedAt> <notes> [pwaUrl]
// Rewrites web/src/download.json (bump buildNumber, mark live, publish PWA URL).
const fs = require('fs')
const path = require('path')

const [version, apkUrl, sizeMb, releasedAt, ...rest] = process.argv.slice(2)
const pwaUrl = rest.length > 1 ? rest.pop() : ''
const notes = rest.join(' ')
if (!version || !apkUrl || !sizeMb || !releasedAt || !notes) {
  console.error(
    'usage: bun scripts/update-manifest.js <version> <apkUrl> <sizeMb> <releasedAt> <notes> [pwaUrl]',
  )
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
// The PWA lives at its own URL. An empty value hides the browser option on
// the site rather than linking to a dead page.
if (pwaUrl) {
  m.pwaUrl = pwaUrl
}
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n')
console.log(JSON.stringify(m, null, 2))
