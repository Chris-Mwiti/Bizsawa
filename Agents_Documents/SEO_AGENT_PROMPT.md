# AI Coding Agent Brief: Full SEO Optimization
**Target Application:** BizSawa — Next.js (App Router) Web Application  
**Scope:** Complete technical SEO implementation across the entire codebase  
**Authority Level:** Full read/write access to all source files

---

## 0. BEFORE YOU WRITE A SINGLE LINE OF CODE

1. Run `next --version` and confirm the project is on **Next.js 13+** with the **App Router** (`/app` directory).
2. Audit the existing metadata: search for any legacy `<Head>` imports from `next/head` — these must be removed and replaced with the Metadata API.
3. Scan every `page.tsx` / `layout.tsx` for `export const metadata` or `export async function generateMetadata`. List every file that is missing either.
4. Check `public/robots.txt` and `public/sitemap.xml` — if either exists as a static file, **delete them**; they will be replaced with dynamic Next.js file conventions.
5. Read `next.config.js` (or `.ts`) and note any existing `headers()`, `redirects()`, or `rewrites()` that might conflict with canonical URL strategy.

Do not proceed to implementation until this audit is complete and documented in a short summary comment at the top of a new file called `SEO_AUDIT.md` in the project root.

---

## 1. METADATA FOUNDATION

### 1a. Root Layout — `app/layout.tsx`

Add a `metadataBase` export **first**, before any other metadata field. This is mandatory; without it all Open Graph and canonical URLs will be relative and broken in social previews.

```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://bizsawa.com'), // ← replace with production domain
  title: {
    default: 'BizSawa — AI-Powered Business & Finance for East Africa',
    template: '%s | BizSawa',
  },
  description:
    'BizSawa helps small business owners and entrepreneurs in Kenya and East Africa manage finances, track cash flow, and grow with AI-powered insights.',
  applicationName: 'BizSawa',
  authors: [{ name: 'BizSawa', url: 'https://bizsawa.com' }],
  generator: 'Next.js',
  keywords: [
    'business management Kenya',
    'AI finance app East Africa',
    'small business accounting Kenya',
    'cash flow tracker Nairobi',
    'biashara management app',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    url: 'https://bizsawa.com',
    siteName: 'BizSawa',
    title: 'BizSawa — AI-Powered Business & Finance for East Africa',
    description:
      'Manage your business finances, invoices, and cash flow with AI. Built for Kenyan and East African entrepreneurs.',
    images: [
      {
        url: '/og/default.png', // 1200×630px — create this image
        width: 1200,
        height: 630,
        alt: 'BizSawa — AI Business Management for East Africa',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BizSawa — AI-Powered Business & Finance for East Africa',
    description:
      'Manage your business finances and grow with AI. Built for Kenya and East Africa.',
    images: ['/og/default.png'],
    creator: '@bizsawa', // update handle
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: 'https://bizsawa.com',
  },
}
```

Set `<html lang="en-KE">` in the root layout.

### 1b. Per-Page Static Metadata

Every public `page.tsx` must export its own `metadata` object. Example for a Features page:

```ts
// app/features/page.tsx
export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore BizSawa's AI-powered features: invoicing, cash flow tracking, expense management, and business insights tailored for East Africa.',
  alternates: { canonical: '/features' },
  openGraph: {
    title: 'BizSawa Features — AI Tools for East African Businesses',
    description: '...',
    url: '/features',
    images: [{ url: '/og/features.png', width: 1200, height: 630 }],
  },
}
```

Every page must have: `title`, `description`, `alternates.canonical`, `openGraph.url`.

### 1c. Dynamic Pages — `generateMetadata`

For any `[slug]` or `[id]` route:

```ts
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug)
  if (!post) return { title: 'Not Found' }
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      images: [{ url: post.ogImage ?? '/og/default.png', width: 1200, height: 630 }],
    },
  }
}
```

### 1d. Pages That Must Be `noindex`

Any route that should NOT be indexed (dashboard, auth, preview, search results with filters):

```ts
export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: '/dashboard' },
}
```

---

## 2. DYNAMIC OG IMAGE GENERATION

Create `app/opengraph-image.tsx` (root) and route-specific variants (e.g., `app/blog/[slug]/opengraph-image.tsx`) using the `ImageResponse` API:

```ts
// app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'BizSawa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0A0A0F', // BizSawa void background
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        {/* brand logo + tagline — match the actual BizSawa brand */}
        <span style={{ color: '#F59E0B', fontSize: 72, fontWeight: 700 }}>BizSawa</span>
        <span style={{ color: '#fff', fontSize: 32, marginTop: 16 }}>
          AI Business Management for East Africa
        </span>
      </div>
    ),
    { ...size }
  )
}
```

Create blog/dynamic variants that pull the post title into the image.

---

## 3. ROBOTS.TS AND SITEMAP.TS

### 3a. `app/robots.ts`

```ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/', '/auth/', '/_next/', '/admin/'],
      },
    ],
    sitemap: 'https://bizsawa.com/sitemap.xml',
    host: 'https://bizsawa.com',
  }
}
```

### 3b. `app/sitemap.ts`

Generate a dynamic sitemap that includes all static routes **and** all dynamic content (blog posts, feature pages, etc.):

```ts
import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/posts' // adapt to your data layer

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://bizsawa.com'
  const now = new Date().toISOString()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${baseUrl}/features`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
  ]

  const posts = await getAllPosts()
  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.updatedAt ?? post.publishedAt,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...postRoutes]
}
```

Verify the sitemap renders at `/sitemap.xml` locally before committing.

---

## 4. STRUCTURED DATA (JSON-LD)

Create a reusable `<JsonLd>` component:

```tsx
// components/seo/JsonLd.tsx
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
```

### 4a. Organization Schema — `app/layout.tsx` (global)

```ts
const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'BizSawa',
  url: 'https://bizsawa.com',
  logo: 'https://bizsawa.com/logo.png',
  description: 'AI-powered business and financial management platform for East Africa.',
  foundingDate: '2024', // update
  areaServed: ['KE', 'TZ', 'UG', 'RW'],
  sameAs: [
    'https://twitter.com/bizsawa',
    'https://linkedin.com/company/bizsawa',
    // add others
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'support@bizsawa.com',
    availableLanguage: ['English', 'Swahili'],
  },
}
```

Place `<JsonLd data={orgSchema} />` in `app/layout.tsx` inside `<body>`.

### 4b. SoftwareApplication Schema — Homepage / Landing Page

```ts
const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'BizSawa',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Financial Management',
  operatingSystem: 'Web, iOS, Android',
  url: 'https://bizsawa.com',
  description:
    'AI-powered financial and business management assistant for small businesses in Kenya and East Africa.',
  offers: [
    {
      '@type': 'Offer',
      name: 'Free Plan',
      price: '0',
      priceCurrency: 'KES',
      description: 'Basic business management features',
    },
    {
      '@type': 'Offer',
      name: 'Pro Plan',
      price: '999', // update
      priceCurrency: 'KES',
      billingIncrement: 'P1M', // monthly
      description: 'Full AI-powered features for growing businesses',
    },
  ],
  // Add aggregateRating once you have real review data
}
```

### 4c. FAQPage Schema — Pricing / FAQ Section

```ts
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does BizSawa work for M-Pesa transactions?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, BizSawa integrates with M-Pesa to automatically record and categorize your mobile money transactions.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is BizSawa available in Kenya?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'BizSawa is built specifically for Kenya and the East African market, with support for KES, TZS, UGX, and RWF currencies.',
      },
    },
    // Add 5–8 real FAQs relevant to BizSawa's user questions
  ],
}
```

**Note:** FAQ rich snippets are restricted by Google to government/health sites in SERPs, but FAQ schema significantly boosts AI Overview and Answer Engine citations (ChatGPT, Perplexity, Gemini). Always include it.

### 4d. BreadcrumbList Schema — Dynamic Pages

Add to every deep-path page:

```ts
const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://bizsawa.com' },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://bizsawa.com/blog' },
    { '@type': 'ListItem', position: 3, name: post.title, item: `https://bizsawa.com/blog/${post.slug}` },
  ],
}
```

### 4e. BlogPosting Schema — Each Blog Post Page

```ts
const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.excerpt,
  image: [post.ogImage ?? 'https://bizsawa.com/og/default.png'],
  datePublished: post.publishedAt,
  dateModified: post.updatedAt ?? post.publishedAt,
  author: [{ '@type': 'Person', name: post.author ?? 'BizSawa Team' }],
  publisher: {
    '@type': 'Organization',
    name: 'BizSawa',
    logo: { '@type': 'ImageObject', url: 'https://bizsawa.com/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': `https://bizsawa.com/blog/${post.slug}` },
}
```

---

## 5. IMAGE OPTIMIZATION

- **Replace every `<img>` tag** with Next.js `<Image>` from `next/image`. No exceptions.
- Every `<Image>` must have a meaningful, keyword-rich `alt` attribute.
- The **hero/LCP image** must have `priority` prop set to `true`:

```tsx
<Image src="/hero.png" alt="BizSawa dashboard showing cash flow for a Nairobi business" width={1200} height={630} priority />
```

- Use `sizes` prop for responsive images to avoid oversized downloads on mobile:

```tsx
<Image src="/feature.png" alt="..." sizes="(max-width: 768px) 100vw, 50vw" fill />
```

- Convert all static assets to **WebP** format. Source images go in `public/images/`.
- Add `next.config.js` image domains/remote patterns for any external image sources.

---

## 6. FONT OPTIMIZATION

Replace any `@import url(...)` CSS font loading or third-party font tags with Next.js `next/font`:

```ts
// app/fonts.ts
import { Inter, Outfit } from 'next/font/google'

export const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
export const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit' })
```

Apply in `app/layout.tsx`:

```tsx
<html lang="en-KE" className={`${inter.variable} ${outfit.variable}`}>
```

This self-hosts fonts at build time, eliminates render-blocking, and prevents CLS from font swap.

---

## 7. CORE WEB VITALS

### LCP (Largest Contentful Paint) — Target < 2.5s
- `priority` on hero image (see §5).
- Preload critical CSS.
- Server Components by default — minimize `'use client'` directives. Every `'use client'` boundary adds to bundle size and hurts INP/TBT.
- Use `loading="eager"` only on above-the-fold images; everything else defaults to lazy.

### INP (Interaction to Next Paint) — Target < 200ms
- Prefer Server Components. Promote to Client only when you need `useState`, `useEffect`, or browser APIs.
- Heavy client components (charts, modals, rich editors) → wrap in `next/dynamic` with `{ ssr: false }`:

```ts
const Chart = dynamic(() => import('@/components/Chart'), { ssr: false })
```

- Avoid event handlers that trigger expensive synchronous work.

### CLS (Cumulative Layout Shift) — Target < 0.1
- Always specify `width` and `height` (or `fill` + container dimensions) on every `<Image>`.
- Use `display: swap` on fonts (already covered by `next/font`).
- Reserve space for async-loaded embeds (ads, iframes, modals) with skeleton placeholders.

---

## 8. RENDERING STRATEGY

| Route Type | Strategy | Reason |
|---|---|---|
| Landing page (`/`) | **SSG** (default static) | Max performance, pre-rendered HTML for crawlers |
| Feature pages | **SSG** | Static content, no SSR cost |
| Pricing page | **ISR** (`revalidate: 3600`) | Prices may update; keep fresh without SSR |
| Blog list (`/blog`) | **ISR** (`revalidate: 60`) | New posts appear within 1 min |
| Blog post (`/blog/[slug]`) | **SSG + `generateStaticParams`** | All posts pre-built |
| Dashboard / user pages | **CSR** with `'use client'` | Private, no indexing needed |

In `page.tsx` for ISR pages, export:

```ts
export const revalidate = 3600 // seconds
```

---

## 9. URL & CANONICALIZATION

- Use **kebab-case** slugs everywhere: `/ai-cash-flow-tracking` not `/AiCashFlowTracking`.
- Set `trailingSlash: false` in `next.config.js` and enforce it.
- Every page must declare its canonical URL in metadata (`alternates.canonical`).
- Add a permanent redirect for trailing slashes in `next.config.js`:

```js
async redirects() {
  return [
    { source: '/:path+/', destination: '/:path+', permanent: true },
  ]
}
```

- If the site is accessible on both `www.` and root domain, pick one and redirect permanently.

---

## 10. SECURITY & PERFORMANCE HEADERS

In `next.config.js`, add SEO-relevant security headers:

```js
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(self)',
        },
      ],
    },
    {
      source: '/(.*)\\.(png|jpg|jpeg|webp|svg|ico|woff2)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
  ]
},
```

HTTPS redirect is handled by the hosting platform (Vercel auto-enforces). Confirm it is enabled.

---

## 11. INTERNAL LINKING ARCHITECTURE

- Every page must have at least **2 contextual internal links** using descriptive anchor text.
- Blog posts must link to related posts AND to the relevant Feature/Pricing page.
- Landing page sections must have clear CTA links: "Start Free Trial", "View Pricing", "See Features".
- Add a `<nav aria-label="Breadcrumb">` component on all pages deeper than `/` — this supports both accessibility and the BreadcrumbList JSON-LD.
- Audit `<a>` tags: replace generic anchor text like "click here" or "learn more" with keyword-rich text like "see BizSawa's invoicing features".

---

## 12. ACCESSIBILITY AS SEO

Semantic HTML improves both crawler understanding and user experience, which is a ranking signal:

- Use proper heading hierarchy: exactly **one `<h1>`** per page (the main keyword-rich page title), then `<h2>` for sections, `<h3>` for subsections.
- All interactive elements must have accessible labels: `aria-label` on icon buttons, `alt` on images, `<label>` on form inputs.
- Colour contrast ratio ≥ 4.5:1 for body text (critical given the dark void background).
- Add `lang` attribute to `<html>` (done in §1a, confirm it propagates).

---

## 13. `_NOT_FOUND` AND `_ERROR` PAGES

Create `app/not-found.tsx` and `app/error.tsx`:

```tsx
// app/not-found.tsx
export const metadata = { title: 'Page Not Found', robots: { index: false } }
export default function NotFound() { /* friendly 404 UI */ }
```

Fast, clean 404/500 pages prevent crawl budget waste and maintain user trust.

---

## 14. ANALYTICS & SEARCH CONSOLE SETUP

These are not code changes, but instruct the developer/product owner to complete them alongside this implementation:

1. **Google Search Console**: Verify domain ownership, submit the sitemap URL (`https://bizsawa.com/sitemap.xml`), monitor the **Enhancements** tab for structured data errors within 7 days.
2. **Google Rich Results Test**: Test the homepage, a blog post, and the pricing page at `https://search.google.com/test/rich-results`.
3. **Schema.org Validator**: Validate all JSON-LD at `https://validator.schema.org`.
4. **PageSpeed Insights / Lighthouse**: Run on the homepage and target LCP < 2.5s, INP < 200ms, CLS < 0.1. Fix any red/amber issues before launch.
5. **Google Analytics 4** (or Plausible for privacy-first): Load conditionally after user consent to avoid CLS/performance penalty from synchronous script injection.

---

## 15. GEO — GENERATIVE ENGINE OPTIMIZATION

AI Overviews, ChatGPT, Perplexity, and Gemini now account for a significant and growing share of search traffic. Optimize for them:

- **Structured facts**: Every marketing claim should be supported by a specific, attributable data point on the page (e.g., "Process 500+ transactions per month" — not just "powerful").
- **FAQ schema everywhere** (see §4c) — AI systems strongly favour Q&A-structured content for citations.
- **Clear entity definition**: The Organization and SoftwareApplication schemas (§4a, §4b) tell AI systems exactly what BizSawa is and who it serves.
- **Author authority**: Blog posts should have a visible author byline with a bio linking to a consistent author profile; include author schema.
- **Freshness**: Set `dateModified` on all content. Stale `lastModified` in sitemaps signals neglect to both crawlers and LLMs.
- **`llms.txt`** (emerging standard): Create `/public/llms.txt` describing the site structure for AI crawlers:

```
# BizSawa
> AI-powered business and financial management for small businesses in Kenya and East Africa.

## Key Pages
- /features — Product features overview
- /pricing — Subscription plans and pricing
- /blog — Business guides for East African entrepreneurs
```

---

## 16. DELIVERABLES CHECKLIST

Before declaring this task complete, verify every item:

- [ ] `metadataBase` set in root layout
- [ ] `title.template` set in root layout
- [ ] Every `page.tsx` has unique `title`, `description`, and `alternates.canonical`
- [ ] Dynamic routes use `generateMetadata`
- [ ] Dashboard / auth routes are `noindex`
- [ ] `app/robots.ts` exists and renders correctly at `/robots.txt`
- [ ] `app/sitemap.ts` exists and renders correctly at `/sitemap.xml`; includes all public routes
- [ ] `app/opengraph-image.tsx` exists; dynamic variants for blog posts
- [ ] Organization JSON-LD in root layout
- [ ] SoftwareApplication JSON-LD on homepage
- [ ] FAQPage JSON-LD on pricing/FAQ page
- [ ] BreadcrumbList JSON-LD on all deep pages
- [ ] BlogPosting JSON-LD on each blog post
- [ ] All `<img>` replaced with `<Image>` with `alt`, `width`, `height`
- [ ] Hero image has `priority` prop
- [ ] All fonts via `next/font` (no external font `@import`)
- [ ] `trailingSlash: false` and redirect in `next.config.js`
- [ ] Security/cache headers configured
- [ ] Exactly one `<h1>` per page
- [ ] `app/not-found.tsx` and `app/error.tsx` exist and are noindex
- [ ] `SEO_AUDIT.md` written at project root documenting what was found and changed
- [ ] Structured data validated via Rich Results Test and Schema.org validator
- [ ] Lighthouse mobile score ≥ 90 for Performance and SEO

---

## NOTES FOR THE AGENT

- **Never mix** the old `<Head>` API from `next/head` with the new Metadata API. The two conflict and cause duplicate tags.
- **Do not invent** schema properties — only use properties documented at schema.org for the relevant type.
- **Do not fabricate** review/rating data in AggregateRating schema. Only add rating schema when real, visible, user-generated reviews exist on the page.
- When in doubt about whether to `noindex` a page, **err toward noindex** for anything that is functional (auth flows, user dashboards, search/filter results) and **index** only content pages.
- The `og:image` must be an absolute URL. The `metadataBase` setting makes this automatic for relative paths — do not construct absolute URLs manually.
- Kenya-specific SEO tip: use natural Swahili/English bilingual phrasing in descriptions and FAQs where appropriate (e.g., "biashara management" alongside "business management") to capture search queries in both languages.
