import { env } from '../../config/env.js';
import { logger } from '../../shared/logger/logger.js';
import { synthesizeOpenAiSpeechOpus } from './telegram-tts.js';

const TELEGRAM_API = 'https://api.telegram.org';
const TELEGRAM_TEXT_MAX = 4096;

/** Jaga pikk tekst Telegrami `sendMessage` piirangu järgi; esimene tükk võib siduda `reply_to_message_id`-ga. */
export function splitTelegramPlainText(text: string): string[] {
  const t = text.trim();
  if (t.length <= TELEGRAM_TEXT_MAX) {
    return t ? [t] : [];
  }
  const out: string[] = [];
  let rest = t;
  while (rest.length > 0) {
    if (rest.length <= TELEGRAM_TEXT_MAX) {
      out.push(rest);
      break;
    }
    const hard = rest.slice(0, TELEGRAM_TEXT_MAX);
    let cut = TELEGRAM_TEXT_MAX;
    const lastPara = hard.lastIndexOf('\n\n');
    if (lastPara >= TELEGRAM_TEXT_MAX - 900) {
      cut = lastPara + 2;
    } else {
      const lastNl = hard.lastIndexOf('\n');
      if (lastNl >= TELEGRAM_TEXT_MAX - 700) {
        cut = lastNl + 1;
      } else {
        const lastSp = hard.lastIndexOf(' ');
        if (lastSp >= TELEGRAM_TEXT_MAX - 500) {
          cut = lastSp + 1;
        }
      }
    }
    const piece = rest.slice(0, cut).trimEnd();
    if (!piece) {
      out.push(rest.slice(0, TELEGRAM_TEXT_MAX - 1) + '…');
      rest = rest.slice(TELEGRAM_TEXT_MAX - 1).trimStart();
      continue;
    }
    out.push(piece);
    rest = rest.slice(cut).trimStart();
  }
  return out;
}

export function isTelegramPinBotReplyEnabled(): boolean {
  return env.TELEGRAM_PIN_BOT_REPLY !== false;
}

export function isTelegramVoiceReplyEnabled(): boolean {
  return env.TELEGRAM_VOICE_REPLY === true;
}

/** Telegram `sendMessage` / `sendVoice` — inline nupud (nt heli sisse/välja). */
export type TelegramInlineReplyMarkup = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

export const telegramAudioToggleInlineKeyboard: TelegramInlineReplyMarkup = {
  inline_keyboard: [[{ text: '🔊 Audio ON/OFF', callback_data: 'toggle_audio' }]],
};

export type TelegramSendPlainOptions = {
  replyToMessageId?: number;
  /** Viimane `sendMessage` segment võib kanda nuppu (nt heli lüliti). */
  replyMarkup?: TelegramInlineReplyMarkup;
  /**
   * Kui true (vaikimisi) ja `TELEGRAM_PIN_BOT_REPLY` pole välja — kinnitab selle sõnumi pärast saatmist.
   * Mitme lõigu vastuses: sea false, lõpp käsitleb `sendTelegramPlainMessageSegments`.
   */
  pinReply?: boolean;
};

export type TelegramSendSegmentsOptions = TelegramSendPlainOptions & {
  /** Vaikimisi 12 — vältimaks tsüklit väga pikkade vastuste korral. */
  maxSegments?: number;
  /** Vaikimisi kinnitatakse ainult viimane lõik (üleval nähtav). */
  pinLastSegmentOnly?: boolean;
  /** Kui true, lisatakse `telegramAudioToggleInlineKeyboard` ainult viimasele tekstilõigule. */
  attachAudioToggleKeyboard?: boolean;
};

async function telegramPostJson(method: string, body: Record<string, unknown>): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return false;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.warn({ method, status: res.status }, 'Telegram API request failed');
      return false;
    }
    const j = (await res.json()) as { ok?: boolean };
    return j.ok === true;
  } catch (err) {
    logger.warn({ err, method }, 'Telegram API request error');
    return false;
  }
}

export type TelegramChatAction = 'typing' | 'record_voice' | 'upload_voice';

export async function sendTelegramChatAction(action: TelegramChatAction): Promise<void> {
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    return;
  }
  await telegramPostJson('sendChatAction', { chat_id: chatId, action });
}

export async function sendTelegramChatTyping(): Promise<void> {
  await sendTelegramChatAction('typing');
}

export async function pinTelegramChatMessage(messageId: number): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId || !isTelegramPinBotReplyEnabled()) {
    return false;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        disable_notification: true,
      }),
    });
    const j = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || j.ok !== true) {
      logger.warn({ status: res.status, description: j.description }, 'Telegram pinChatMessage failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, 'Telegram pinChatMessage error');
    return false;
  }
}

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
      return;
    }
    const j = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
    const mid = j.ok === true ? j.result?.message_id : undefined;
    if (typeof mid === 'number' && isTelegramPinBotReplyEnabled()) {
      await pinTelegramChatMessage(mid);
    }
  } catch (err) {
    logger.warn({ err }, 'Telegram sendMessage error');
  }
}

/** LLM / kasutaja tekst — ilma HTML-eksimusteta (Telegrami `parse_mode` puudub). Tagastab `message_id` või null. */
export async function sendTelegramPlainMessage(
  text: string,
  options?: TelegramSendPlainOptions,
): Promise<number | null> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return null;
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: text.length > TELEGRAM_TEXT_MAX ? `${text.slice(0, TELEGRAM_TEXT_MAX - 1)}…` : text,
  };
  if (options?.replyToMessageId !== undefined) {
    body.reply_to_message_id = options.replyToMessageId;
  }
  if (options?.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }

  const wantPin = options?.pinReply !== false && isTelegramPinBotReplyEnabled();

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const j = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!res.ok || j.ok !== true) {
      logger.warn({ status: res.status, description: j.description }, 'Telegram sendMessage (plain) failed');
      return null;
    }
    const mid = j.result?.message_id;
    if (typeof mid !== 'number') {
      return null;
    }
    if (wantPin) {
      await pinTelegramChatMessage(mid);
    }
    return mid;
  } catch (err) {
    logger.warn({ err }, 'Telegram sendMessage (plain) error');
    return null;
  }
}

/**
 * POST `sendVoice` (multipart). Ainult `TELEGRAM_CHAT_ID` vestlus — teised `chatId` ignoreeritakse.
 * Tagastab `message_id` või null.
 */
export async function sendTelegramVoice(
  chatId: string | number,
  oggBuffer: Buffer,
  options?: TelegramSendPlainOptions,
): Promise<number | null> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const allowed = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !allowed || String(chatId) !== allowed) {
    return null;
  }

  const form = new FormData();
  form.append('chat_id', allowed);
  const copy = new Uint8Array(oggBuffer.length);
  copy.set(oggBuffer);
  form.append('voice', new Blob([copy], { type: 'audio/ogg' }), 'voice.ogg');
  if (options?.replyToMessageId !== undefined) {
    form.append('reply_to_message_id', String(options.replyToMessageId));
  }

  const wantPin = options?.pinReply !== false && isTelegramPinBotReplyEnabled();

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendVoice`, {
      method: 'POST',
      body: form,
    });
    const j = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!res.ok || j.ok !== true) {
      logger.warn({ status: res.status, description: j.description }, 'Telegram sendVoice failed');
      return null;
    }
    const mid = j.result?.message_id;
    if (typeof mid !== 'number') {
      return null;
    }
    if (wantPin) {
      await pinTelegramChatMessage(mid);
    }
    return mid;
  } catch (err) {
    logger.warn({ err }, 'Telegram sendVoice error');
    return null;
  }
}

/** Saadab häälsõnumi (OGG Opus) seadistatud vestlusesse. Tagastab `message_id` või null. */
export async function sendTelegramVoiceOgg(
  opusBuffer: Buffer,
  options?: TelegramSendPlainOptions,
): Promise<number | null> {
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    return null;
  }
  return sendTelegramVoice(chatId, opusBuffer, options);
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  opts?: { text?: string; showAlert?: boolean },
): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !callbackQueryId) {
    return false;
  }
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (opts?.text !== undefined) {
    body.text = opts.text.slice(0, 200);
  }
  if (opts?.showAlert === true) {
    body.show_alert = true;
  }
  return telegramPostJson('answerCallbackQuery', body);
}

/**
 * Roberti vastus Telegramisse: valikuliselt TTS + `sendVoice`, muidu ainult tekst.
 * Pikad vastused: kuni 4096 märki TTS-is, ülejäänud tekstina (esimene tekstilõik vastab hääle sõnumile).
 */
export async function sendTelegramAssistantReply(text: string, options?: TelegramSendSegmentsOptions): Promise<void> {
  const full = text.trim();
  if (!full) {
    return;
  }
  if (!isTelegramVoiceReplyEnabled()) {
    await sendTelegramPlainMessageSegments(full, options);
    return;
  }

  await sendTelegramChatAction('record_voice');
  const ttsPart = full.slice(0, 4096);
  const opus = await synthesizeOpenAiSpeechOpus(ttsPart);
  if (!opus || opus.length < 80) {
    logger.warn({}, 'telegram: TTS puudub või liiga lühike — saadan ainult tekstina');
    await sendTelegramPlainMessageSegments(full, options);
    return;
  }

  const pinEnabled = isTelegramPinBotReplyEnabled() && options?.pinReply !== false;
  const pinLastOnly = options?.pinLastSegmentOnly !== false;

  const vid = await sendTelegramVoiceOgg(opus, {
    replyToMessageId: options?.replyToMessageId,
    pinReply: false,
  });
  let lastId: number | null = vid;
  if (full.length > 4096) {
    const tailLast = await sendTelegramPlainMessageSegments(full.slice(4096), {
      ...options,
      replyToMessageId: vid ?? options?.replyToMessageId,
      pinReply: false,
      pinLastSegmentOnly: false,
    });
    lastId = tailLast ?? lastId;
  }
  if (pinEnabled && pinLastOnly && lastId !== null) {
    await pinTelegramChatMessage(lastId);
  }
}

/** Saadab pika vastuse mitu järjestikust sõnumit (esimene vastab kasutaja sõnumile). Tagastab viimase sõnumi `message_id` või null. */
export async function sendTelegramPlainMessageSegments(
  text: string,
  options?: TelegramSendSegmentsOptions,
): Promise<number | null> {
  const segments = splitTelegramPlainText(text);
  const max = options?.maxSegments ?? 12;
  if (segments.length === 0) {
    return null;
  }
  const pinEnabled = isTelegramPinBotReplyEnabled() && options?.pinReply !== false;
  const pinLastOnly = options?.pinLastSegmentOnly !== false;
  /** Kui true, kinnitatakse iga lõik eraldi (harvad); muidu ainult viimane `pinTelegramChatMessage` pärast tsüklit. */
  const pinEachSegment = pinEnabled && !pinLastOnly;

  const markup =
    options?.replyMarkup ??
    (options?.attachAudioToggleKeyboard ? telegramAudioToggleInlineKeyboard : undefined);

  const n = Math.min(segments.length, max);
  let lastId: number | null = null;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1 && segments.length <= max;
    const id = await sendTelegramPlainMessage(segments[i], {
      replyToMessageId: i === 0 ? options?.replyToMessageId : undefined,
      pinReply: pinEachSegment,
      replyMarkup: isLast ? markup : undefined,
    });
    if (typeof id === 'number') {
      lastId = id;
    }
  }
  if (segments.length > max) {
    const id = await sendTelegramPlainMessage(`… (${segments.length - max} lõiku jäi saatmata — lühenda küsimust või palu kokkuvõtet.)`, {
      pinReply: pinEachSegment,
      replyMarkup: markup,
    });
    if (typeof id === 'number') {
      lastId = id;
    }
  }
  if (pinEnabled && pinLastOnly && lastId !== null) {
    await pinTelegramChatMessage(lastId);
  }
  return lastId;
}

export type TelegramWebhookInfoSafe = {
  url: string | null;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
  max_connections?: number;
};

export async function fetchTelegramBotUsernameSafe(): Promise<string | null> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return null;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    if (!j.ok || !j.result?.username) {
      return null;
    }
    return String(j.result.username);
  } catch (err) {
    logger.warn({ err }, 'Telegram getMe failed');
    return null;
  }
}

/**
 * Telegram `getWebhookInfo` — server kutsub Bot API-t; token jääb serverisse.
 */
export async function fetchTelegramWebhookInfoSafe(): Promise<TelegramWebhookInfoSafe | null> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return null;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getWebhookInfo`);
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as { ok?: boolean; result?: TelegramWebhookInfoSafe };
    if (!j.ok || !j.result) {
      return null;
    }
    return {
      url: j.result.url ?? null,
      has_custom_certificate: j.result.has_custom_certificate,
      pending_update_count: j.result.pending_update_count,
      last_error_message: j.result.last_error_message,
      last_error_date: j.result.last_error_date,
      max_connections: j.result.max_connections,
    };
  } catch (err) {
    logger.warn({ err }, 'Telegram getWebhookInfo failed');
    return null;
  }
}
