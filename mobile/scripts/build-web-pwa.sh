#!/usr/bin/env bash
#
# Builds the installable web (PWA) bundle and packages it for any static host.
#
#   mobile/scripts/build-web-pwa.sh [version]
#
# Output: mobile/dist/ (the site) and mobile/dist-pwa/bizsawa-pwa-v<version>.zip
#
# Hosting notes:
#   - The bundle uses absolute asset paths ("/_expo/static/..."), so it must be
#     served from the ROOT of a host. GitHub Pages project sites live under a
#     subpath, so they need a custom domain (CNAME) — or use any host that
#     serves the app at the domain root (Cloudflare Pages, Netlify, S3+CDN,
#     nginx).
#   - 404.html is a copy of index.html so a static host that rewrites
#     unknown paths to 404.html still boots the SPA (expo-router reads the
#     path from the URL and routes client-side).
set -euo pipefail

VERSION="${1:-dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
OUT="$ROOT/dist-pwa"

cd "$ROOT"

echo "▸ exporting web bundle"
rm -rf "$DIST"
bun run build:web

echo "▸ adding SPA fallback (404.html)"
cp "$DIST/index.html" "$DIST/404.html"

echo "▸ packaging"
rm -rf "$OUT"
mkdir -p "$OUT"
ZIP="$OUT/bizsawa-pwa-v${VERSION}.zip"
(cd "$DIST" && zip -qr "$ZIP" .)

echo "▸ done"
echo "  site:  $DIST"
echo "  zip:   $ZIP  ($(du -h "$ZIP" | cut -f1))"
echo
echo "  Deploy the CONTENTS of dist/ to the root of your host."
echo "  For a custom domain point CNAME at the host and serve at /."
