#!/usr/bin/env bash
# Permanent fix for "Network Error" when running the mobile app on a physical
# device against the local backend (`make dev-up` in ../backend).
#
# What it does, every run:
#   1. Resolves the current LAN IP via resolve-lan-ip.sh (default-route src,
#      NOT `hostname -I | awk '{print $1}'` which can return a docker bridge).
#   2. Verifies the backend answers at http://<LAN_IP>:5504/health.
#      If not, fails fast with the exact remedial command instead of letting
#      the app boot into axios "Network Error".
#   3. Sets up `adb reverse tcp:5504 tcp:5504` (+ 8081 for Metro) when a USB
#      device is attached, so the app ALSO works over USB if Wi-Fi AP isolation
#      blocks LAN traffic.
#   4. Refreshes mobile/.env.development's EXPO_PUBLIC_API_URL to the current
#      LAN IP so normal `bun run android` / `expo start` runs keep working.
#   5. Launches `expo run:android` with the fresh EXPO_PUBLIC_API_URL.
#
# Usage:
#   bun run android:lan            # this script
#   ./scripts/android-lan.sh       # direct
#   API_PORT=5504 ./scripts/android-lan.sh -- --clear-cache
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_PORT="${API_PORT:-5504}"
ENV_FILE="$MOBILE_DIR/.env.development"

LAN_IP="$("$SCRIPT_DIR/resolve-lan-ip.sh")"
API_URL="http://${LAN_IP}:${API_PORT}/api/v1"

echo "[android:lan] LAN IP detected: $LAN_IP"
echo "[android:lan] API URL: $API_URL"

# --- 1. Backend reachability check (fail fast, not "Network Error" in app) ---
if ! curl -sf -m 5 "http://${LAN_IP}:${API_PORT}/health" >/dev/null; then
  echo "[android:lan] ERROR: backend not reachable at http://${LAN_IP}:${API_PORT}/health" >&2
  if curl -sf -m 3 "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
    echo "[android:lan] Backend IS up on localhost but NOT on the LAN IP." >&2
    echo "  Likely causes: backend container restarted with a new network, or host firewall." >&2
    echo "  Check: docker ps | grep 5504 ; ss -tlnp | grep $API_PORT" >&2
  else
    echo "[android:lan] Backend is not running at all." >&2
    echo "  Start it first:  (cd ../backend && make dev-up)" >&2
  fi
  echo "  Phone and PC must be on the SAME Wi-Fi (no guest/AP isolation, no VPN)." >&2
  exit 1
fi
echo "[android:lan] Backend reachable ✓"

# --- 2. USB fallback: adb reverse (harmless when no device attached) ---
if command -v adb >/dev/null 2>&1; then
  if adb devices 2>/dev/null | grep -q $'\tdevice$'; then
    adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}" >/dev/null 2>&1 || true
    adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
    echo "[android:lan] adb reverse tcp:${API_PORT}+8081 set ✓ (USB fallback active)"
  else
    echo "[android:lan] No adb USB device — LAN/Wi-Fi path only (this is fine)."
  fi
else
  echo "[android:lan] adb not found — skipping USB fallback."
fi

# --- 3. Refresh .env.development so plain `bun run android` also works ---
if [ -f "$ENV_FILE" ]; then
  if grep -q '^EXPO_PUBLIC_API_URL=' "$ENV_FILE"; then
    # Replace only the EXPO_PUBLIC_API_URL line, keep comments/keys intact.
    sed -i "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=${API_URL}|" "$ENV_FILE"
  else
    printf '\nEXPO_PUBLIC_API_URL=%s\n' "$API_URL" >> "$ENV_FILE"
  fi
  echo "[android:lan] Updated $ENV_FILE → $API_URL"
fi

# --- 4. Launch ---
export EXPO_PUBLIC_API_URL="$API_URL"
export EXPO_PUBLIC_ENV="${EXPO_PUBLIC_ENV:-development}"
echo "[android:lan] Starting: expo run:android (EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL)"
exec npx expo run:android "$@"
