/**
 * One-shot codemod: give every <Text> a real Geist family.
 *
 * WHY THIS EXISTS
 * ---------------
 * 836 <Text> elements render in the app. Before this ran, 777 of them asked for
 * no font family at all and fell through to the platform default (San Francisco
 * / Roboto), while 504 of those carried `font-bold` / `font-semibold` /
 * `font-medium` — which set `font-weight` but could not help, because no family
 * was ever named. The font was loading correctly the whole time; nothing was
 * requesting it.
 *
 * The weight-aware part matters. Tailwind's `font-bold` sets `font-weight: 700`,
 * but lib/theme/fonts.ts registers each weight under its own family name
 * precisely because a bundled static family has no bold face for iOS to
 * synthesise. So a `font-bold` with only `font-sans` (the 400 file) yields a
 * faked or dropped weight. Pointing the family at the real face is the fix.
 *
 * `font-bold` is deliberately LEFT IN PLACE — it is now redundant rather than
 * wrong, and removing it would change semantics for anything reading the
 * resolved style. Where a pre-existing family class conflicts with the target
 * (`font-sans` + `font-geist-bold` would be two font-family utilities), the old
 * one is dropped so exactly one family is ever emitted.
 *
 * Edits are applied by AST byte offset, in reverse, so untouched code keeps its
 * original formatting and the diff stays reviewable.
 *
 * Usage:  node scripts/apply-font-families.js [--dry]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const parser = require(path.join(ROOT, 'node_modules/@babel/parser'))
const traverse = require(path.join(ROOT, 'node_modules/@babel/traverse')).default

const DRY = process.argv.includes('--dry')

/** Tailwind weight utilities, grouped by which real face they should select. */
const BOLD = new Set(['font-bold', 'font-extrabold', 'font-black'])
const SEMIBOLD = new Set(['font-semibold'])
const MEDIUM = new Set(['font-medium'])
const WEIGHTS = new Set([...BOLD, ...SEMIBOLD, ...MEDIUM, 'font-thin', 'font-light', 'font-normal', 'font-extralight'])
const FAMILIES = new Set(['font-sans', 'font-mono', 'font-serif'])

const cols = (n) => (n === undefined ? '(none)' : n)

/** Decide the single family class a <Text> should carry. */
function targetFamily(cls) {
  const has = (s) => cls.includes(s)
  const isMono = has('font-mono')

  // Mono is checked first and separately. `font-mono` is already the 500 face,
  // so medium/normal need nothing, and only a bold request changes the family.
  // Falling through to the sans branches here would silently convert a money
  // figure off the monospace face — the one thing MONEY_STYLE depends on.
  if (isMono) {
    return cls.some((c) => BOLD.has(c)) ? 'font-geist-mono-bold' : null
  }

  if (cls.some((c) => BOLD.has(c))) return 'font-geist-bold'
  if (cls.some((c) => SEMIBOLD.has(c))) return 'font-geist-semibold'
  if (cls.some((c) => MEDIUM.has(c))) return 'font-geist-medium'
  if (has('font-sans')) return null
  return 'font-sans'
}

/** Split a className attribute into the classes and the whitespace around them. */
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
let changedNodes = 0
let skipped = 0
const summary = {}

for (const file of collectFiles()) {
  const code = fs.readFileSync(file, 'utf8')
  let ast
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [['typescript', {}], 'jsx', 'decorators-legacy', 'classProperties'],
    })
  } catch (e) {
    console.error(`SKIP (parse) ${path.relative(ROOT, file)}: ${e.message}`)
    continue
  }

  /** @type {{start:number,end:number,text:string}[]} */
  const edits = []

  traverse(ast, {
    JSXOpeningElement(p) {
      const nm = p.node.name
      if (nm.type !== 'JSXIdentifier' || nm.name !== 'Text') return

      const cn = p.node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'className')

      // ---- No className at all: insert one right after the tag name. ----
      if (!cn) {
        edits.push({
          start: nm.end,
          end: nm.end,
          text: ' className="font-sans"',
        })
        changedNodes++
        summary['(no className) -> font-sans'] = (summary['(no className) -> font-sans'] || 0) + 1
        return
      }

      // ---- Resolve the current class list, whichever form it takes. ----
      let cls = []
      let container = null
      const v = cn.value

      if (v && v.type === 'StringLiteral') {
        cls = v.value.split(/\s+/).filter(Boolean)
        container = { kind: 'string', node: v }
      } else if (v && v.type === 'JSXExpressionContainer' && v.expression.type === 'TemplateLiteral') {
        const tpl = v.expression
        container = { kind: 'template', node: tpl }
        cls = tpl.quasis.flatMap((q) => (q.value.cooked || '').split(/\s+/)).filter(Boolean)
      } else {
        // e.g. className={styles.x} — not safely rewritable by offset.
        skipped++
        return
      }

      const target = targetFamily(cls)
      if (!target) return

      // Drop a pre-existing family class that would now conflict.
      const keep = cls.filter((c) => !(FAMILIES.has(c) && c !== target))
      const next = [target, ...keep.filter((c) => c !== target)]

      const before = cls.join(' ')
      const after = next.join(' ')
      if (before === after) return
      summary[`${cols(before.split(' ').find((c) => FAMILIES.has(c)))} + ${cols(before.split(' ').find((c) => WEIGHTS.has(c)))} -> ${target}`] =
        (summary[`${cols(before.split(' ').find((c) => FAMILIES.has(c)))} + ${cols(before.split(' ').find((c) => WEIGHTS.has(c)))} -> ${target}`] || 0) + 1

      if (container.kind === 'string') {
        // node.start sits on the opening quote; reuse whichever was used.
        const q = code[container.node.start] === "'" ? "'" : '"'
        edits.push({
          start: container.node.start,
          end: container.node.end,
          text: `${q}${after}${q}`,
        })
      } else {
        // Prepend to the first quasi, and strip any conflicting family token.
        // The replacement keeps the captured leading whitespace: dropping it
        // outright would fuse two classes into one ('text-xs' + 'font-bold').
        const familyRe = new RegExp(
          `(^|\\s)(${[...FAMILIES].join('|')})(?=\\s|$)`,
          'g'
        )
        const first = container.node.quasis[0]
        const head = first.value.raw.replace(familyRe, (_m, sp) => sp)
        edits.push({
          start: first.start,
          end: first.end,
          text: head.trim().length ? `${target} ${head}` : target,
        })
        for (const q of container.node.quasis.slice(1)) {
          const t = q.value.raw
          const cleaned = t.replace(familyRe, (_m, sp) => sp)
          if (cleaned !== t) edits.push({ start: q.start, end: q.end, text: cleaned })
        }
      }
      changedNodes++
    },
  })

  if (!edits.length) continue

  // De-dupe identical ranges, then apply back-to-front so offsets stay valid.
  const uniq = new Map()
  for (const e of edits) uniq.set(`${e.start}:${e.end}`, e)
  let out = code
  for (const e of [...uniq.values()].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  if (out !== code) {
    changedFiles++
    if (!DRY) fs.writeFileSync(file, out)
  }
}

console.log(DRY ? 'DRY RUN — nothing written\n' : '')
console.log(`files changed   ${changedFiles}`)
console.log(`<Text> rewritten ${changedNodes}`)
if (skipped) console.log(`skipped (non-literal className) ${skipped}`)
console.log('\ntransformations:')
for (const [k, v] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`)
}
