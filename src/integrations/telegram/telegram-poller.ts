import { env } from '../../config/index.js';
import { logger } from '../../shared/logger/logger.js';

const TELEGRAM_API = 'https://api.telegram.org';

/**
 * Kui `TELEGRAM_USE_POLLING=true` ja webhooki avalikku URL-i pole, küsib Telegramist `getUpdates`
 * ja edastab iga uuenduse kohalikule `POST /api/integrations/telegram/webhook` (sama loogika mis Bot API webhook).
 * Käivitamisel kutsub `deleteWebhook`, et `getUpdates` töötaks.
 */
export async function startTelegramLongPollingIfEnabled(): Promise<void> {
  if (!env.TELEGRAM_USE_POLLING) {
    return;
  }
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    logger.warn({}, 'telegram poller: disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    return;
  }

  try {
    const del = await fetch(`${TELEGRAM_API}/bot${token}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const delJ = (await del.json()) as { ok?: boolean; description?: string };
    if (!del.ok || delJ.ok !== true) {
      logger.warn({ status: del.status, body: delJ }, 'telegram poller: deleteWebhook failed (continuing)');
    } else {
      logger.info({}, 'telegram poller: deleteWebhook OK — getUpdates mode');
    }
  } catch (err) {
    logger.warn({ err }, 'telegram poller: deleteWebhook error (continuing)');
  }

  void runTelegramPollLoop(token);
}

async function forwardUpdateToLocalWebhook(update: unknown, port: number): Promise<void> {
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) {
    headers['X-Telegram-Bot-Api-Secret-Token'] = secret;
  }
  const url = `http://127.0.0.1:${port}/api/integrations/telegram/webhook`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(update),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: t.slice(0, 200) }, 'telegram poller: local webhook forward failed');
    }
  } catch (err) {
    logger.warn({ err }, 'telegram poller: local webhook fetch error');
  }
}

async function runTelegramPollLoop(token: string): Promise<void> {
  const port = env.PORT;
  let offset = 0;
  logger.info({ port }, 'telegram poller: loop started');

  for (;;) {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${token}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset,
          timeout: 50,
          allowed_updates: ['message', 'edited_message', 'callback_query'],
        }),
      });
      const j = (await res.json()) as { ok?: boolean; result?: { update_id: number }[]; description?: string };
      if (!res.ok || j.ok !== true) {
        logger.warn({ status: res.status, description: j.description }, 'telegram poller: getUpdates failed');
        await sleep(4000);
        continue;
      }
      const list = j.result ?? [];
      for (const u of list) {
        await forwardUpdateToLocalWebhook(u, port);
        offset = u.update_id + 1;
      }
    } catch (err) {
      logger.warn({ err }, 'telegram poller: loop error');
      await sleep(4000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
