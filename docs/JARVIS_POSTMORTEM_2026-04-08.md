# JARVIS POSTMORTEM 2026-04-08

## Root cause
Parameter was not set because analysis scope was too narrow.
Patch was evaluated locally, not as a full chain.

Missing before patch:
- chain scope
- source of truth
- read order
- write order
- freshness rule
- visible proof rule

## Correct conclusion
For state / summary / output / flow logic:
- chain scope = full-chain
- source of truth = mandatory
- backup = yes
- runtime proof = mandatory
- if any parameter is missing -> STOP

## What failed
1. write path checked
2. read path not fully checked
3. source-of-truth precedence not locked
4. output-path proof not locked

## Permanent rule
No logic patch is allowed without parameter matrix filled first.
