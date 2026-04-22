#!/bin/sh
set -eu

cat <<'EOF'
Jarvis ops commands:

- npm run ops:progress
  Readiness 0-100 summary + next actions (Make/Google/Backups)

- npm run ops:one
  One-shot deploy/check: pull -> secrets -> ci -> build -> openai -> channel -> pm2 restart -> health:compact

- npm run health:compact
  One-line OK/FAIL for health+openai+crm+whatsapp+channel

- npm run channel:check
  Full channel checks (local + public)

- npm run smoke
  Full local smoke run
EOF

