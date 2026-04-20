#!/bin/sh
set -eu

cat <<'EOF'
# Optional shell aliases (copy to your ~/.zshrc):
alias jops='npm run ops:one'
alias jstat='npm run health:compact'
alias jchan='JARVIS_CHANNEL_CHECK_COMPACT=1 npm run channel:check'
alias jsmoke='npm run smoke'
EOF

