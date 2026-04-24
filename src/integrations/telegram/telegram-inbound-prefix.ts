import { env } from '../../config/index.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type TelegramInboundPrefixResult =
  | { ok: true; forLlm: string }
  | { ok: false; reason: 'missing_prefix' };

/**
 * Kui `TELEGRAM_INBOUND_PREFIX_REQUIRED` ja `TELEGRAM_INBOUND_PREFIX` on mõlemad seatud,
 * peab sõnum (pärast trim) algama selle eesliitega + tühik või koolon — muidu ei lähe LLM-i.
 */
export function applyTelegramInboundPrefix(raw: string): TelegramInboundPrefixResult {
  const t = raw.trim();
  const required = env.TELEGRAM_INBOUND_PREFIX_REQUIRED === true;
  const prefix = env.TELEGRAM_INBOUND_PREFIX?.trim();
  if (!required || !prefix) {
    return { ok: true, forLlm: t };
  }

  const esc = escapeRegex(prefix);
  const afterColon = new RegExp(`^${esc}\\s*:\\s*`, 'i');
  const afterSpace = new RegExp(`^${esc}\\s+`, 'i');

  let forLlm: string;
  if (afterColon.test(t)) {
    forLlm = t.replace(afterColon, '').trim();
  } else if (afterSpace.test(t)) {
    forLlm = t.replace(afterSpace, '').trim();
  } else {
    return { ok: false, reason: 'missing_prefix' };
  }

  if (!forLlm) {
    return { ok: false, reason: 'missing_prefix' };
  }
  return { ok: true, forLlm };
}

export function telegramInboundPrefixHint(): string {
  const p = env.TELEGRAM_INBOUND_PREFIX?.trim() ?? 'PREFIX';
  return [
    `Küsimus peab algama eesliitega "${p}:" või "${p} " (nt "${p}: mis ilm?").`,
    `Иначе сообщение не уйдёт в Robert/LLM — префикс обязателен.`,
    'Käsud /ping, /jarvis, /inbox töötavad alati ilma eesliiteta.',
  ].join('\n');
}
