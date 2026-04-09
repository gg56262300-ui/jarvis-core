# SAFE PATCH PROMPT TEMPLATE

Use this exact structure for every small repo patch.

## Target
- Exact goal:
- Exact user-facing command/behavior:
- Done when:

## Not this
- Do NOT implement:
- Do NOT reinterpret intent as:

## Allowed scope
- Allowed files/areas:
- Prefer reusing existing services/modules:

## Forbidden
- No unrelated changes
- No broad cleanup
- No commit
- No push
- No kill/pkill broad restart flow
- No replacing existing working behavior unless explicitly required

## Output format
===== PLAN =====
- brief patch plan

===== FILES TO CHANGE =====
- exact files

===== IMPLEMENTATION =====
- what was changed

===== VALIDATION =====
- exact commands run
- result

===== MANUAL TEST PHRASES =====
- phrases to test

===== NOTES =====
- edge cases / assumptions

## Required wording block
Target intent IS:
"..."

Target intent is NOT:
"..."

Meaning:
- ...

Constraints:
- minimal safe patch only
- reuse existing architecture
- keep naming consistent
- do not change unrelated behavior
