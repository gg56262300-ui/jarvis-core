# WHATSAPP_TRANSLATION_SYSTEM_REPO_AUDIT_AND_IMPLEMENTATION_PLAN

Date: 2026-05-15
Repo: gg56262300-ui/jarvis-core
Scope: WhatsApp part of Jarvis only. Do not refactor unrelated Jarvis modules unless they are direct dependencies of the WhatsApp flow.

## Objective

Perform a hard, source-level and runtime-level audit of the WhatsApp subsystem inside Jarvis and produce a concrete implementation plan to make the WhatsApp translation/intake system production-ready.

The required system must be clarified first:

1. If this is an owner-translation workflow: inbound customer WhatsApp messages must be translated/summarized for the business owner and sent to the owner channel/number, not back to the customer.
2. If this is a customer-facing auto-reply workflow: customer replies must be in the customer language, while owner-facing Estonian translation must be routed separately.

Current code appears to say "translate for business owner" but sends the translated output back to the original inbound WhatsApp sender. Treat this as a P0 ambiguity/bug until confirmed.

## Hard Rules

- Do not guess. Mark unknowns as UNKNOWN.
- Do not print, copy, commit, or expose secrets.
- Do not edit production secrets or .env values.
- Do not implement broad refactors until the audit and plan are complete.
- Keep the audit limited to WhatsApp, CRM intake, translation path, Meta Cloud API, Make/agent-inbox reuse, and direct dependencies.
- Use exact file paths and line references in your report.
- Separate "repo source status" from "runtime status".
- If runtime checks cannot be executed, say exactly why.

## Files and Areas to Inspect

Read at minimum:

```bash
sed -n '1,260p' src/app.ts
sed -n '1,260p' src/whatsapp/index.ts
sed -n '1,320p' src/whatsapp/meta-cloud.ts
sed -n '1,320p' src/whatsapp/whatsapp.service.ts
sed -n '1,160p' src/whatsapp/whatsapp.types.ts
sed -n '1,220p' src/whatsapp/meta-cloud.types.ts
sed -n '1,260p' src/config/env.ts
sed -n '1,220p' .env.example
sed -n '1,260p' src/crm/crm.service.ts
sed -n '1,220p' src/crm/index.ts
sed -n '1,260p' src/chat/chat.controller.ts
sed -n '1250,1660p' src/chat/chat.controller.ts
sed -n '1,220p' src/translation/index.ts
sed -n '1,220p' src/shared/http/create-module-router.ts
sed -n '1,260p' src/integrations/make/index.ts
sed -n '1,260p' src/integrations/make/make-webhook.client.ts
sed -n '1,220p' src/agent-inbox/agent-inbox.service.ts
sed -n '1,220p' src/agent-inbox/index.ts
sed -n '1,220p' scripts/smoke-crm-whatsapp.sh
sed -n '1,360p' scripts/jarvis-autocheck.mjs
```

Search:

```bash
grep -R "WHATSAPP_\|whatsapp\|WhatsApp\|Meta\|translation\|agent-inbox\|MAKE_WEBHOOK\|Graph API" -n src scripts tests .env.example package.json | head -500
find tests -maxdepth 2 -type f | sort
find src/whatsapp -maxdepth 2 -type f | sort
```

## Runtime Checks To Run If Safe

Run these without exposing secrets:

```bash
npm run typecheck
npm run lint
npm run smoke:crm
npm run autocheck:once
curl -s http://127.0.0.1:3000/api/whatsapp/health | jq .
curl -s http://127.0.0.1:3000/api/crm/leads | jq .
```

If local server is not running, report that. Do not start or restart services unless explicitly approved by the owner.

## Audit Output Required

Create or update `docs/WHATSAPP_AUDIT.md` with these sections:

1. Executive Status
   - Overall completion percentage for MVP.
   - Overall completion percentage for production-grade system.
   - One-sentence verdict.

2. Current Architecture
   - Exact endpoints.
   - Data flow from Meta webhook to service to CRM/translation/outbound reply.
   - Dependencies: OpenAI, Meta Cloud API, SQLite CRM, Google Contacts, Make, agent-inbox, PM2/cloudflared if visible.

3. What Is Already Done
   - List only verified implemented features.

4. What Is Partial
   - List partial features and exact missing parts.

5. What Is Missing Or Broken
   - Include the owner-vs-customer translation routing issue.
   - Include missing idempotency/deduplication by Meta message id.
   - Include missing outbound persistence.
   - Include missing real Meta webhook tests.
   - Include missing dedicated translation service/schema.
   - Include missing Graph API retry/failure queue.
   - Include missing media/audio/template/session-window handling.
   - Include business-hours timezone weakness.

6. Required Environment Configuration
   - WHATSAPP_CLOUD_VERIFY_TOKEN
   - WHATSAPP_CLOUD_APP_SECRET
   - WHATSAPP_CLOUD_ACCESS_TOKEN
   - WHATSAPP_CLOUD_PHONE_NUMBER_ID
   - WHATSAPP_CLOUD_GRAPH_VERSION
   - WHATSAPP_BILINGUAL_REPLY
   - WHATSAPP_CLOUD_SKIP_SIGNATURE_VERIFY only for temporary non-production testing
   - Proposed: WHATSAPP_OWNER_PHONE_NUMBER or owner notification channel config if owner-translation workflow is required.

7. Test Plan
   - Unit tests.
   - Integration tests.
   - Webhook signature fixture tests.
   - Graph API send mock tests.
   - Translation normalization tests.
   - CRM message persistence tests.
   - Dedup/idempotency tests.

8. Implementation Plan
   - P0: clarify product behavior and fix dangerous routing.
   - P1: stabilize webhook/security/idempotency/persistence.
   - P2: dedicated translation service and owner/customer split.
   - P3: production ops, Make routing, retries, dashboards, docs.

9. Resource And Time Estimate
   - Estimate hours for MVP.
   - Estimate hours for production-grade.
   - Mention what requires external setup in Meta Business Manager.

10. Acceptance Criteria
   - Concrete pass/fail checklist.

## Expected Implementation Direction

Recommended target architecture:

Meta WhatsApp Webhook
→ verify raw-body signature
→ parse and deduplicate inbound message id
→ store inbound CRM message
→ run deterministic workflow classifier
→ if translation needed: call dedicated translation service with strict JSON output
→ create separate outputs:
   - ownerNotificationText
   - customerReplyText
→ route owner notification to configured owner channel/number/agent-inbox/Make
→ route customer reply only when safe and intentionally enabled
→ store outbound records
→ retry or log failed outbound sends
→ expose health and diagnostics without secrets

## P0 Fix Candidates

1. Add explicit config:
   - WHATSAPP_OWNER_PHONE_NUMBER
   - WHATSAPP_SEND_TRANSLATION_TO_OWNER=true/false
   - WHATSAPP_CUSTOMER_AUTO_REPLY_ENABLED=true/false

2. Split reply variables:
   - ownerNotificationText
   - customerReplyText

3. Never send an Estonian owner translation back to a foreign-language customer unless explicitly intended.

4. Add `meta_message_id` storage or a separate `whatsapp_messages` table for deduplication.

5. Treat `processChatRequestBody(... degraded: true ...)` as not a valid translation; do not send degraded fallback as translation.

## Deliverable Format

After the audit, output:

```json
{
  "status": "done|partial|blocked",
  "mvp_completion_percent": 0,
  "production_completion_percent": 0,
  "critical_blockers": [],
  "implemented": [],
  "partial": [],
  "missing": [],
  "runtime_checks": [],
  "recommended_next_steps": [],
  "estimated_hours": {
    "mvp": "",
    "production": ""
  }
}
```

Do not hide uncertainty. If something cannot be verified from source or runtime, mark it as UNKNOWN and list the exact check required.