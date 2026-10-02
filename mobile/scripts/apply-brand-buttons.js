/**
 * One-shot codemod: move black CTAs onto the teal brand system.
 *
 * BEFORE: every primary action was hand-rolled as `bg-gray-900` — a blue-black
 * (#111827) with nothing to do with the brand — plus two off-brand teals
 * (`#006b5f` raw hex, `#00C4B4` bright cyan) floating in onboarding/social.
 *
 * AFTER: `bg-accent` (#006B5F) for actions, selected chips, brand icon tiles,
 * progress fills, toggles-on and count pills. `border-accent` for selected
 * chip borders. Raw hexes collapse onto the same tokens so the palette file
 * stays the single source of truth.
 *
 * Deliberately NOT touched:
 * - `bg-black/*` overlays and bezels (scrim, not brand).
 * - Dark ledger surfaces (SalesEntryModal total, tour tooltip) — those become
 *   `bg-ink` in a manual follow-up, not accent, because a full-teal panel
 *   would read as decoration rather than ink.
 * - Status greens/reds/blues (paid/overdue/role badges) — status hues stay.
 *
 * Usage: node scripts/apply-brand-buttons.js [--dry]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')

/** [pattern, replacement, label] — order matters, hexes first. */
const RULES = [
  [/bg-\[#006[Bb]5[Ff]\]/g, 'bg-accent', 'raw-teal-bg -> accent'],
  [/border-\[#006[Bb]5[Ff]\]/g, 'border-accent', 'raw-teal-border -> accent'],
  [/text-\[#006[Bb]5[Ff]\]/g, 'text-accent', 'raw-teal-text -> accent'],
  [/bg-\[#00C4B4\]/g, 'bg-accent', 'cyan-bg -> accent'],
  [/border-\[#00C4B4\]/g, 'border-accent', 'cyan-border -> accent'],
  [/bg-gray-900/g, 'bg-accent', 'cta-black -> accent'],
  [/border-gray-900/g, 'border-accent', 'chip-border -> accent'],
]

function collectFiles() {
  const out = []
  for (const dir of ['app', 'components']) {
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name)
        if (e.isDirectory()) walk(f)
        else if (/\.tsx?$/.test(e.name)) out.push(f)
      }
    }
    walk(path.join(ROOT, dir))
  }
  return out
}

let changedFiles = 0
let totalEdits = 0
const tally = {}

for (const file of collectFiles()) {
  const code = fs.readFileSync(file, 'utf8')
  let out = code
  for (const [re, to, label] of RULES) {
    const hits = out.match(re)
    if (hits) {
      tally[label] = (tally[label] || 0) + hits.length
      totalEdits += hits.length
      out = out.replace(re, to)
    }
  }
  if (out !== code) {
    changedFiles++
    if (!DRY) fs.writeFileSync(file, out)
  }
}

console.log(DRY ? 'DRY RUN — nothing written\n' : '')
console.log(`files changed  ${changedFiles}`)
console.log(`replacements   ${totalEdits}`)
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`)
}
