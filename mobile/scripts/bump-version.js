// Usage: bun scripts/bump-version.js <version>
// Rewrites expo.version in mobile/app.json. Fails loudly on bad input.
const fs = require('fs')
const path = require('path')

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`usage: bun scripts/bump-version.js <semver> (got: ${version})`)
  process.exit(1)
}

const p = path.join(__dirname, '..', 'app.json')
const j = JSON.parse(fs.readFileSync(p, 'utf8'))
j.expo.version = version
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
console.log(`app.json version -> ${version}`)
