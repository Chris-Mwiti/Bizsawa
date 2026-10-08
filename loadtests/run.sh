#!/usr/bin/env bash
# Bizworth k6 runner: spike / soak / stress across every module + workflows.
#
# Usage:
#   ./run.sh [smoke|spike|soak|stress] [module|all]     # backend modules
#   ./run.sh spike workflows                            # e2e + mobile workflows
#   ./run.sh smoke auth                                 # single module smoke
#
# Env: BASE_URL (default http://localhost:5504/api/v1), TOKEN or
# TEST_EMAIL/TEST_PASSWORD, BUSINESS_ID, SOAK_DURATION (default 20m),
# WRITE_PAYMENTS=1 / WRITE_WAHA=1 / WRITE_LLM=1 (side-effect gates, default off).
set -euo pipefail
cd "$(dirname "$0")"

PROFILE="${1:-smoke}"
TARGET="${2:-all}"

command -v k6 >/dev/null || { echo "k6 not found — https://grafana.com/docs/k6/set-up/install-k6/"; exit 1; }

BASE_URL="${BASE_URL:-http://localhost:5504/api/v1}"
if ! curl -sf -m 3 "${BASE_URL%/api/v1}/health" >/dev/null 2>&1; then
  echo "WARN: backend health check failed at $BASE_URL — runs will show connection errors."
  echo "Start it first:  cd ../backend && docker compose up -d postgres redis && go run ./cmd/api"
fi

MODULES=(auth business users products customers taxes inventory orders sales expenses invoices payments analytics sync waha-chat)

run_one() {
  local file="$1" name="$2"
  local out="results/${PROFILE}-${name}-summary.json"
  mkdir -p results
  echo "=== [$PROFILE] $name ==="
  k6 run --env PROFILE="$PROFILE" --summary-export="$out" "$file" || echo "--- $name finished with failures (see above) ---"
}

if [[ "$TARGET" == "workflows" ]]; then
  run_one workflows/e2e-business.js e2e-business
  run_one workflows/mobile-flows.js mobile-flows
elif [[ "$TARGET" == "all" ]]; then
  for m in "${MODULES[@]}"; do
    run_one "modules/${m}.js" "$m"
  done
else
  if [[ -f "modules/${TARGET}.js" ]]; then
    run_one "modules/${TARGET}.js" "$TARGET"
  else
    echo "Unknown target '$TARGET'. Modules: ${MODULES[*]} | workflows"
    exit 1
  fi
fi

echo "Done. JSON summaries in results/ — import into Grafana Cloud k6 or plot with:"
echo "  k6 run --out json=results/raw.json modules/products.js   # raw sample stream"
