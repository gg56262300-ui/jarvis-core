#!/usr/bin/env bash
# cloudflared peab kasutama IPv4 loopbacki: macOS-is "localhost" võib lahenduda ::1 peale
# ja Node kuulab tavaliselt 127.0.0.1 / 0.0.0.0 — [::1]:3000 annab connection refused.
set -euo pipefail
PORT="${JARVIS_PORT:-3000}"
exec cloudflared tunnel run --url "http://127.0.0.1:${PORT}" jarvis
