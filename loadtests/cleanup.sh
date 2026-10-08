#!/usr/bin/env bash
# loadtests/cleanup.sh — archive stats, purge k6 rows, clear local logs.
#
# Order of operations (stats are preserved BEFORE anything is deleted):
#   1. Copy results/*.json -> results-archive/<timestamp>/ (your stats copy)
#   2. Run cleanup.sql against DATABASE_URL for BUSINESS_ID (prod guard below)
#   3. Clear the working results/ dir (local logs), archive stays on disk
#
# Env:
#   BUSINESS_ID   UUID of the test business (required)
#   DATABASE_URL  postgres DSN with rights on the target DB (required for step 2)
#   CLEANUP_YES=1 skip the interactive prod confirmation (CI use)
#
# Server-side app logs (Render) are not reachable from here — collect anything
# you need from the Render dashboard BEFORE running this script.
set -euo pipefail
cd "$(dirname "$0")"

BUSINESS_ID="${BUSINESS_ID:-}"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "$BUSINESS_ID" ]]; then
  echo "ERROR: BUSINESS_ID is required (UUID of the test business)."
  exit 1
fi

# 1. Archive stats first — never delete before the numbers are safe.
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "results-archive/$TS"
if compgen -G "results/*.json" > /dev/null; then
  cp results/*.json "results-archive/$TS"/
  echo "Archived $(ls results/*.json | wc -l) result file(s) -> results-archive/$TS/"
else
  echo "WARN: no results/*.json to archive."
fi

# 2. Purge k6 rows (prod guard).
if [[ -z "$DATABASE_URL" ]]; then
  echo "ERROR: DATABASE_URL is required to purge the database."
  echo "Stats are safe in results-archive/$TS/ — re-run with DATABASE_URL set."
  exit 1
fi
if [[ "${CLEANUP_YES:-0}" != "1" ]]; then
  echo "About to DELETE k6 test rows for business $BUSINESS_ID"
  echo "via the database in DATABASE_URL. This cannot be undone."
  read -r -p "Type the business id to confirm: " CONFIRM
  if [[ "$CONFIRM" != "$BUSINESS_ID" ]]; then
    echo "Aborted (confirmation mismatch). Stats remain in results-archive/$TS/."
    exit 1
  fi
fi
command -v psql >/dev/null || { echo "ERROR: psql not found."; exit 1; }
psql "$DATABASE_URL" -v BUSINESS_ID="$BUSINESS_ID" -f cleanup.sql

# 3. Clear local working logs; the timestamped archive is the record.
rm -f results/*.json
echo "Cleared results/ working dir. Stats preserved in results-archive/$TS/."
echo "Done."
