# Jarvis Core

Jarvis Core is the backend foundation for a personal AI automation assistant. This repository starts with a clean Node.js + TypeScript service architecture, SQLite as the first persistence layer, structured logging, centralized error handling, and modular domains for future integrations.

## Stack

- Node.js
- TypeScript
- Express
- Pino
- SQLite via `better-sqlite3`
- Zod for environment validation

## Getting Started

Node version is pinned in `.nvmrc`.

```bash
npm install
cp .env.example .env
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## Architecture

The backend is organized around domain modules under `src/`. Each module owns its router, service, and any prompts or contracts it needs.

- `src/config`
  Loads and validates environment variables, then exposes typed runtime config.
- `src/shared`
  Contains cross-cutting concerns such as logging, database access, HTTP helpers, and error handling.
- `src/* module folders`
  Hold domain-specific logic for Jarvis capabilities like contacts, Gmail, calendar, reminders, CRM, and AI routing.

### Request Flow

1. `src/index.ts` bootstraps configuration and starts the HTTP server.
2. `src/app.ts` builds the Express app, attaches middleware, registers module routers, and installs centralized error handling.
3. Each module exposes a router through its `index.ts`.
4. Services contain module business logic.
5. Prompt-bearing modules keep prompt text in dedicated `prompts/` files so model instructions are separated from service code.

### Data Layer

SQLite is wrapped behind a `DatabaseProvider` interface in `src/shared/database`. The current implementation uses `better-sqlite3`, but the app depends on the interface rather than the concrete client. Replacing SQLite later should mainly involve swapping the provider implementation and module repositories.

## Current Endpoints

- `GET /health`
- `GET /api/contacts`
- `GET /api/gmail`
- `GET /api/calendar`
- `GET /api/translation`
- `GET /api/ai-routing`
- `GET /api/voice`
- `GET /api/reminders`
- `GET /api/crm`
- `GET /api/jobs`

All module endpoints currently return lightweight bootstrap responses so the foundation is wired end to end.

## Environment Variables

Keep secrets in `.env` only. The app expects values like:

- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `VOICE_PROVIDER_API_KEY`
- `CRM_PROVIDER_API_KEY`

## Notes

- No frontend is included.
- Prompts are kept separate from business logic.
- Logging is structured JSON through Pino.
- Errors are normalized by one global handler.

