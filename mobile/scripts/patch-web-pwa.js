#!/usr/bin/env node
/**
 * Post-processes the exported web bundle for PWA installability.
 *
 * Expo's web export emits theme-color and description, but not the tags a
 * browser needs to offer "Install app":
 *   - <link rel="manifest">   → the web app manifest
 *   - <link rel="apple-touch-icon"> → iOS home-screen icon
 *   - <meta name="mobile-web-app-capable"> → standalone display on Android
 *
 * We inject them into dist/index.html rather than forking Expo's HTML
 * template, so the export stays reproducible and the tags are visible here.
 *
 * Usage: node scripts/patch-web-pwa.js [distDir]
 */
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error(`[pwa] no index.html at ${indexPath} — did you run "expo export -p web"?`);
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

const tags = [
  '<link rel="manifest" href="/manifest.json" />',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  '<meta name="apple-mobile-web-app-title" content="BizSawa" />',
];

// Skip anything already present so re-running the script is safe.
const missing = tags.filter((tag) => !html.includes(tag));

if (missing.length === 0) {
  console.log('[pwa] index.html already patched');
  process.exit(0);
}

if (html.includes('</head>')) {
  html = html.replace('</head>', `  ${missing.join('\n  ')}\n  </head>`);
} else {
  html = `${missing.join('\n')}\n${html}`;
}

fs.writeFileSync(indexPath, html);
console.log(`[pwa] injected ${missing.length} tag(s) into index.html`);
