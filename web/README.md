# BizSawa web — landing + interactive features

Classy editorial landing page for BizSawa, composed like the RANTY reference:
split serif hero over Nairobi at golden hour (cinematic ink scrims, warm-white
type, glowing ledger card), faint ledger-rule motif, and a bottom strip over
the city lights. Theme tokens mirror
`mobile/lib/theme/palette.js` (paper `#F4F9F7`, ink `#0E1F1C`, accent
`#006B5F`); display serif is headlines-only, UI text stays Geist.

Magic-UI-style primitives (`src/components/magic.tsx`) are hand-built for
this project (shine border, shimmer button, marquee, number ticker, blur
fade) — inspired by Magic UI, not the official package.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
```

## Views

- **Landing** (`Hero` + `Landing`): hero, trades marquee, bento preview,
  AI-coach split, offline band, closing CTA, footer.
- **Features** (`Features`): interactive explorer over the 8 counter jobs
  (POS, inventory, invoices + WhatsApp, expenses, M-Pesa, analytics,
  AI coach, offline-first) with step-by-step detail panels.

The EN/SW toggle in the nav switches the hero and nav strings
(`src/data.ts`); all product figures shown are sample data for illustration.
