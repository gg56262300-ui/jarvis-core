import { env } from '../../config/env.js';
import { logger } from '../../shared/logger/logger.js';

const TELEGRAM_API = 'https://api.telegram.org';

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'Telegram sendMessage failed');
    }
  } catch (err) {
    logger.warn({ err }, 'Telegram sendMessage error');
  }
}
