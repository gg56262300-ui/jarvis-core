# Jarvis Agent Rules

## Main goal
Turn Jarvis into a semi-autonomous development system with:
- stable runtime
- smoke-tested changes
- minimal manual intervention
- real usable features first

## Runtime rules
1. Do not start multiple dev servers.
2. **PM2 is the only allowed runtime management path** for the running Jarvis app.
3. **Do not use**:
   - `npm run dev:hard-clean`
   - `nohup npm run dev`
   - broad `pkill`-based restart flows
4. **Safe runtime workflow (PM2 only)**:
   - `npm run build`
   - `pm2 restart jarvis`
   - wait briefly
   - test relevant endpoints
5. Use `npm run smoke` after meaningful code changes.
6. Use `npm run backup` before risky or structural changes.
7. Do not change port 3000 unless explicitly requested.

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
1. inspect
2. minimal patch
3. `npm run build`
4. `pm2 restart jarvis`
5. wait briefly
6. test relevant endpoints
7. review
8. commit
9. `npm run smoke` (after meaningful changes)
10. `npm run backup` (before risky or structural changes)

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
