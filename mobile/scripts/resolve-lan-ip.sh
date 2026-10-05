#!/usr/bin/env bash
# Resolve the host's LAN IPv4 address — the one a phone on the same Wi-Fi can reach.
#
# Why not `hostname -I | awk '{print $1}'`?
#   hostname -I prints ALL addresses (wifi + docker bridges + IPv6) in no
#   guaranteed order, e.g.:
#     "192.168.100.35 10.0.1.1 10.0.2.1 ... fd31:... "
#   $1 can therefore be a docker bridge (10.x) or change after reboot/DHCP,
#   which is exactly the recurring "Network Error" on the device.
#
# Strategy (first match wins):
#   1. `ip route get 1.1.1.1` -> the `src` address of the default route.
#      This is the interface that actually reaches the LAN/internet.
#   2. First non-docker, non-loopback global IPv4 from `hostname -I`.
#   3. `127.0.0.1` fallback (caller should warn).
set -euo pipefail

# 1. Default-route source address — most reliable.
if command -v ip >/dev/null 2>&1; then
  SRC="$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' | head -n1 || true)"
  if [ -n "${SRC:-}" ] && [ "$SRC" != "127.0.0.1" ]; then
    echo "$SRC"
    exit 0
  fi
fi

# 2. Filter hostname -I: drop loopback, docker bridges, link-local, IPv6.
if command -v hostname >/dev/null 2>&1; then
  for CAND in $(hostname -I 2>/dev/null || true); do
    case "$CAND" in
      127.*|10.0.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|169.254.*|*\:*) continue ;;
      192.168.*|10.*|172.*) echo "$CAND"; exit 0 ;;
    esac
  done
  # Last resort: first globally-routable IPv4 of any kind.
  for CAND in $(hostname -I 2>/dev/null || true); do
    case "$CAND" in
      127.*|*\:*) continue ;;
      *) echo "$CAND"; exit 0 ;;
    esac
  done
fi

echo "127.0.0.1"
