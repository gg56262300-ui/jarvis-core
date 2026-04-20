# Jarvis → Make webhook contract

**Scope:** Outbound automation from Jarvis to [Make](https://www.make.com) via a single Custom Webhook URL (`MAKE_WEBHOOK_URL`). MCP and OAuth are out of scope here.

**Version:** 1 — aligned with voice-originated flows `reminder.set`, `calendar.create`, `calendar.query`.

---

## Transport

| Item | Value |
|------|--------|
| Method | `POST` |
| URL | Scenario webhook URL configured in process env as `MAKE_WEBHOOK_URL` |
| Header | `Content-Type: application/json` |
| Body | JSON object (see envelope) |
| Retries | Jarvis retries transient failures (network, 5xx, 408, 429); not 4xx like 404/410 |
| Persistence on failure | Failed attempts append one JSON line to `data/make-webhook-failed.jsonl` with `{ at, payload, upstreamStatus, error, retryable, failureKind, recommendation }` |

---

## Payload envelope (required shape)

Every request body **must** be a JSON object with:

| Field | Type | Rule |
|-------|------|------|
| `source` | string | Always `"jarvis"` (lowercase) |
| `event` | string | One of the canonical event names in [Event catalog](#event-catalog) |
| `text` | string | Optional at schema level; **each event defines whether it is sent and meaning** |

Machine-readable schema: `spec/make-jarvis-webhook.payload.schema.json`. Canonical string constants: `src/integrations/make/make-events.ts`.

---

## Event catalog

| `event` | When Jarvis emits | Meaning of `text` |
|---------|-------------------|-------------------|
| `reminder.set` | User created a reminder via voice (`lisa meeldetuletus…`) | `"<title> — <ISO8601-with-offset>"` if due time parsed; else `"<title> (no due time)"` |
| `calendar.create` | User created a calendar event via voice and Google Calendar returned success | `"<title> — <start ISO> — <end ISO>"` (same strings used for Google create) |
| `calendar.query` | User asked for upcoming / next calendar info via voice and Google returned `ready` | Same short summary string shown to the user (Estonian UI copy), including list or “no events” lines |

---

## Success and failure

**Success (Jarvis ↔ Make HTTP):** Make responds with **2xx**. Jarvis treats delivery as OK.

**Failure (HTTP):** Non-2xx or network error → Jarvis logs, may retry (if transient), then records to `data/make-webhook-failed.jsonl` on final failure. **Make scenario should still define error handling** (e.g. notification) if the webhook module exposes errors.

**Success (product):** Depends on scenario: e.g. reminder logged, calendar row created, digest sent. This contract only defines **what Jarvis sends**; business outcome is Make-side.

---

## Make-side branch design (3 routers)

Use one scenario with a **Router** (or three filtered routes) immediately after the **Custom Webhook** trigger. Parse `body` as JSON; route on `body.event` (string equality).

### Branch A — `reminder.set`

| Item | Definition |
|------|------------|
| **Filter** | `body.source == "jarvis"` **and** `body.event == "reminder.set"` |
| **Input mapping** | `title_and_time` ← `body.text` (single string; split on `" — "` if you need title vs ISO time in Make) |
| **Minimum next action** | Store or forward for human-visible reminder (e.g. Google Calendar quick event, Slack, or Make datastore); do not require Jarvis changes if format stays as above |

### Branch B — `calendar.create`

| Item | Definition |
|------|------------|
| **Filter** | `body.source == "jarvis"` **and** `body.event == "calendar.create"` |
| **Input mapping** | `text` ← `body.text` (three-part string: title — start — end); optional split on `" — "` for three fields |
| **Minimum next action** | Mirror or audit log (Jarvis already wrote to Google Calendar); e.g. notify channel, CRM note, or secondary calendar |

### Branch C — `calendar.query`

| Item | Definition |
|------|------------|
| **Filter** | `body.source == "jarvis"` **and** `body.event == "calendar.query"` |
| **Input mapping** | `summary` ← `body.text` (Estonian user-facing summary; treat as opaque blob or parse heuristically) |
| **Minimum next action** | Archive, send digest email, or feed analytics; **do not** assume English or fixed grammar inside `text` |

---

## Operational checklist (Make)

1. Webhook URL matches `MAKE_WEBHOOK_URL` on the Jarvis host.
2. Scenario is **on** (listening); 410/404 indicate scenario off or wrong URL.
3. Router order: filter `source` + `event` before any heavy module.
4. Optional: store raw `body` in Make Data Store for debugging.
5. **HTTP 400** with body **«Queue is full»** (või sarnane): Make’i webhook-järjekord on ajutiselt täis — oota, tühjenda *Incomplete executions* Make’is, või kontrolli plaani limiiti. Jarvis teeb selle mustri korral ainult **ühe lisakatse** (fikseeritud lühiootega), et vältida järjekorra lisakoormamist; lõplik lahendus on Make’i pool.

---

## Diagnostics endpoint (`/api/integrations/make/failed`)

- Default: returns up to latest **100** failed records, enriched with `retryable`, `failureKind`, `recommendation`.
- Query params:
  - `limit=1..500` — how many recent records to inspect.
  - `retryable=true|false` (also `1|0`) — optional filter.
  - `kind=<failureKind>` — optional filter (`queue_full`, `rate_limited`, `upstream_5xx`, ...).
- Response includes:
  - `count` (after filter),
  - `sourceCount` (before filter),
  - `retryableCount`,
  - `summary` (counts by `failureKind`),
  - `filters` (effective `limit` + `retryable`).

---

## Changelog

- **v1:** Document `reminder.set`, `calendar.create`, `calendar.query` and shared envelope.
