#!/usr/bin/env bash
# loadtests/bootstrap.sh — from-scratch remote test entity bootstrap.
#
# Registers a fresh user, logs in, creates the first (free-plan) business,
# then prints the exports the suite needs. With RUN_SMOKE=1 it proceeds to
# execute the smoke suite directly against the same target.
#
# Env:
#   BASE_URL    API base (default https://api.bizsawa.chrismwiti.me/api/v1)
#   TEST_EMAIL  override (default k6-bootstrap-<timestamp>@example.com)
#   TEST_PASSWORD override (default K6Bootstrap!123)
#   BIZ_NAME    override (default "k6 Bootstrap Shop <timestamp>")
#   RUN_SMOKE=1 run ./run.sh smoke all afterwards (gates forced off)
#   WRITE_PAYMENTS / WRITE_WAHA / WRITE_LLM — side-effect gates, default off
#
# Nothing is written to disk except k6's own results/*.json — credentials only
# ever live in process env. Delete the bootstrap business/user afterwards via
# cleanup.sql (business id printed below) or the app.
set -euo pipefail
cd "$(dirname "$0")"

BASE_URL="${BASE_URL:-https://api.bizsawa.chrismwiti.me/api/v1}"
BASE_URL="${BASE_URL%/}"
TS="$(date +%s)"
TEST_EMAIL="${TEST_EMAIL:-k6-bootstrap-${TS}@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-K6Bootstrap!123}"
BIZ_NAME="${BIZ_NAME:-k6 Bootstrap Shop ${TS}}"

echo "=== [bootstrap] target $BASE_URL ==="

echo "--- register $TEST_EMAIL"
REG_CODE="$(curl -s -o /tmp/k6-bootstrap-register.json -w '%{http_code}' -m 30 \
  -X POST "$BASE_URL/auth/register" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$TEST_EMAIL" --arg p "$TEST_PASSWORD" '{email:$e,password:$p}')")"
echo "register -> $REG_CODE"
if [[ "$REG_CODE" != "201" && "$REG_CODE" != "200" && "$REG_CODE" != "409" ]]; then
  echo "register body:"; head -c 500 /tmp/k6-bootstrap-register.json; echo
  echo "ERROR: registration failed (expected 201, or 409 if reusing an email)."
  exit 1
fi

echo "--- login"
LOGIN_CODE="$(curl -s -o /tmp/k6-bootstrap-login.json -w '%{http_code}' -m 30 \
  -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$TEST_EMAIL" --arg p "$TEST_PASSWORD" '{email:$e,password:$p}')")"
echo "login -> $LOGIN_CODE"
if [[ "$LOGIN_CODE" != "200" ]]; then
  echo "login body:"; head -c 500 /tmp/k6-bootstrap-login.json; echo
  echo "ERROR: login failed."
  exit 1
fi
TOKEN="$(jq -r '.token // .accessToken // .data.token // empty' /tmp/k6-bootstrap-login.json)"
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: no token in login response:"; head -c 500 /tmp/k6-bootstrap-login.json; echo
  exit 1
fi
echo "login ok (token ${#TOKEN} chars)"

echo "--- create business '$BIZ_NAME'"
BIZ_CODE="$(curl -s -o /tmp/k6-bootstrap-biz.json -w '%{http_code}' -m 30 \
  -X POST "$BASE_URL/businesses" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "$(jq -n --arg n "$BIZ_NAME" '{name:$n}')")"
echo "create-business -> $BIZ_CODE"
if [[ "$BIZ_CODE" != "201" && "$BIZ_CODE" != "200" ]]; then
  echo "create-business body:"; head -c 500 /tmp/k6-bootstrap-biz.json; echo
  echo "ERROR: business creation failed (fresh accounts get 1 free business; 403 = plan limit)."
  exit 1
fi
BUSINESS_ID="$(jq -r '.id // .business.id // .data.id // empty' /tmp/k6-bootstrap-biz.json)"
if [[ -z "$BUSINESS_ID" ]]; then
  echo "ERROR: no business id in response:"; head -c 500 /tmp/k6-bootstrap-biz.json; echo
  exit 1
fi
rm -f /tmp/k6-bootstrap-register.json /tmp/k6-bootstrap-login.json /tmp/k6-bootstrap-biz.json

echo
echo "=== [bootstrap] done ==="
echo "export BASE_URL=\"$BASE_URL\""
echo "export TEST_EMAIL=\"$TEST_EMAIL\""
echo "export TEST_PASSWORD='$TEST_PASSWORD'"
echo "export BUSINESS_ID=\"$BUSINESS_ID\""
echo "export WRITE_PAYMENTS=0 WRITE_WAHA=0 WRITE_LLM=0"

if [[ "${RUN_SMOKE:-0}" == "1" ]]; then
  echo
  echo "=== [bootstrap] RUN_SMOKE=1 — executing smoke suite ==="
  export BASE_URL TEST_EMAIL TEST_PASSWORD BUSINESS_ID
  export WRITE_PAYMENTS=0 WRITE_WAHA=0 WRITE_LLM=0
  ./run.sh smoke all
fi
