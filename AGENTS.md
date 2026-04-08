# Jarvis Agent Rules

## Main goal
Turn Jarvis into a semi-autonomous development system with:
- stable runtime
- smoke-tested changes
- minimal manual intervention
- real usable features first

## Runtime rules
1. Do not start multiple dev servers.
2. Always prefer `npm run dev:hard-clean` when runtime state is unclear.
3. Use `npm run dev:status` before deeper debugging.
4. Use `npm run smoke` after meaningful code changes.
5. Use `npm run backup` before risky changes.
6. Do not change port 3000 unless explicitly requested.

## Coding rules
1. Keep changes small, modular, and reversible.
2. Prefer existing module structure.
3. Do not add unnecessary dependencies.
4. Keep terminal commands simple and safe.
5. Avoid broken heredoc / broken quote syntax.
6. Prefer one logically grouped block over many tiny fragmented steps.

## Priority order
1. Stability
2. Automation
3. Real usable features
4. Nice-to-have improvements later

## Standard workflow
1. `npm run dev:hard-clean`
2. `npm run dev:status`
3. make change
4. `npm run smoke`
5. `npm run backup`

## Current focus
1. Stable runtime control
2. Smoke-tested core routes
3. Agent-readable project state
4. Next: Gmail / Calendar / Contacts smoke coverage

## Live Input Mode
When user sends a new idea, correction, question, or direction change:

1. Classify it as:
- NOW = affects current task immediately
- NEXT = queue after current task
- LATER = store in docs/BACKLOG.md

2. Respond with:
- decision
- impact on current workflow
- pause or continue

3. Default rule:
- continue current step unless input is NOW

4. Interrupt rule:
- if input is NOW, pause current flow, evaluate, then adjust

5. Backlog rule:
- non-immediate ideas belong in docs/BACKLOG.md, not scattered in chat

## RRR Rule
RRR must always include:
1. Jarvis health
2. Mac health
3. basic security/risk check
4. traffic-light summary:
- 🟢 OK
- 🟡 attention
- 🔴 problem

If Jarvis is OK but Mac is slow, report Mac as the bottleneck.
If Mac is OK but Jarvis is failing, report Jarvis as the bottleneck.
