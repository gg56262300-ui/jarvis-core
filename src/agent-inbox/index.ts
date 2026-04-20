import type { Express, Request, Response } from 'express';

import {
  appendAgentInboxEntry,
  isAgentInboxEnabled,
  readAgentInboxTail,
  verifyAgentInboxToken,
} from './agent-inbox.service.js';

function extractToken(req: Request): string | undefined {
  const header = req.headers['x-jarvis-agent-inbox-token'];
  const fromHeader = typeof header === 'string' ? header : undefined;
  const auth = req.headers.authorization;
  const fromBearer =
    typeof auth === 'string' ? /^Bearer\s+(.+)$/i.exec(auth.trim())?.[1] : undefined;
  return (fromHeader ?? fromBearer)?.trim();
}

export function registerAgentInboxModule(app: Express) {
  app.post('/api/agent-inbox', async (req: Request, res: Response) => {
    if (!isAgentInboxEnabled()) {
      res.status(503).json({ ok: false, error: 'AGENT_INBOX_DISABLED' });
      return;
    }
    if (!verifyAgentInboxToken(extractToken(req))) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const text = String(req.body?.text ?? '').trim();
    if (!text) {
      res.status(400).json({ ok: false, error: 'TEXT_REQUIRED' });
      return;
    }

    const sourceRaw = req.body?.source;
    const source = sourceRaw === 'chat' ? 'chat' : 'api';

    await appendAgentInboxEntry({ source, text });
    res.json({ ok: true });
  });

  app.get('/api/agent-inbox', async (req: Request, res: Response) => {
    if (!isAgentInboxEnabled()) {
      res.status(503).json({ ok: false, error: 'AGENT_INBOX_DISABLED' });
      return;
    }
    if (!verifyAgentInboxToken(extractToken(req))) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    const entries = await readAgentInboxTail(limit);
    res.json({ ok: true, entries, count: entries.length });
  });
}
