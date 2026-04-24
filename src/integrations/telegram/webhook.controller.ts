import type { Request, Response } from 'express';
import { DateTime } from 'luxon';

import { env } from '../../config/index.js';
import { processChatRequestBody } from '../../chat/chat.controller.js';
import { appendAgentInboxEntry } from '../../agent-inbox/agent-inbox.service.js';
import { appendChatChannelMessage } from '../../chat/channel.controller.js';
import { logger } from '../../shared/logger/logger.js';
import {
  answerTelegramCallbackQuery,
  sendTelegramChatAction,
  sendTelegramChatTyping,
  sendTelegramPlainMessageSegments,
  sendTelegramVoice,
} from './telegram.client.js';
import { generateVoiceOgg } from '../../voice/tts.service.js';
import { getUserSetting, setUserSetting, toggleUserAudio } from '../../storage/userSettings.js';
import { applyTelegramInboundPrefix, telegramInboundPrefixHint } from './telegram-inbound-prefix.js';
import { handleRobertDevCommand } from './robert-dev-queue.js';
import { tryTelegramSideCommands } from './telegram-side-commands.js';
import { downloadTelegramFile, transcribeAudioBuffer } from './telegram-voice.js';

type TelegramFileRef = {
  file_id: string;
  mime_type?: string;
};

type TelegramMessage = {
  message_id: number;
  from?: { id: number; is_bot?: boolean };
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  voice?: TelegramFileRef;
  video_note?: TelegramFileRef;
  audio?: TelegramFileRef;
  photo?: TelegramFileRef[];
  document?: TelegramFileRef;
};

type TelegramCallbackQuery = {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const recentTelegramUpdateIds = new Set<number>();
const recentTelegramUpdateOrder: number[] = [];
const TELEGRAM_UPDATE_DEDUP_CAP = 2000;

function isDuplicateTelegramUpdate(updateId: number): boolean {
  if (recentTelegramUpdateIds.has(updateId)) {
    return true;
  }
  recentTelegramUpdateIds.add(updateId);
  recentTelegramUpdateOrder.push(updateId);
  while (recentTelegramUpdateOrder.length > TELEGRAM_UPDATE_DEDUP_CAP) {
    const old = recentTelegramUpdateOrder.shift();
    if (old !== undefined) {
      recentTelegramUpdateIds.delete(old);
    }
  }
  return false;
}

function telegramWebhookSecretOk(req: Request): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return true;
  }
  const got = req.get('X-Telegram-Bot-Api-Secret-Token')?.trim();
  return Boolean(got && got === expected);
}

function chatIdAllowed(chatId: number): boolean {
  const allowed = env.TELEGRAM_CHAT_ID?.trim();
  if (!allowed) {
    return false;
  }
  return String(chatId) === allowed;
}

function telegramUserIdFromMessage(msg: TelegramMessage): number {
  return typeof msg.from?.id === 'number' ? msg.from.id : msg.chat.id;
}

/** `/audio_on`, `/audio_off`, `/audio` (+ optional `@BotUsername`). */
function parseAudioPreferenceCommand(raw: string): 'on' | 'off' | 'toggle' | null {
  const t = raw.trim();
  const m = t.match(/^\/(audio_on|audio_off|audio)(@\w+)?$/i);
  if (!m) {
    return null;
  }
  const cmd = m[1].toLowerCase();
  if (cmd === 'audio_on') {
    return 'on';
  }
  if (cmd === 'audio_off') {
    return 'off';
  }
  return 'toggle';
}

/**
 * Tekst kohe, siis valikuliselt hääl (kasutaja seade); TTS ebaõnnestumisel jääb ainult tekst.
 * Inline-klaviatuur viimase tekstilõigu all.
 */
async function deliverTelegramUserReply(params: {
  telegramUserId: number;
  text: string;
  replyToMessageId?: number;
}): Promise<void> {
  const configuredChat = env.TELEGRAM_CHAT_ID?.trim();
  await sendTelegramPlainMessageSegments(params.text, {
    replyToMessageId: params.replyToMessageId,
    attachAudioToggleKeyboard: true,
  });
  if (!getUserSetting(params.telegramUserId).audio || !configuredChat) {
    return;
  }
  try {
    const opus = await generateVoiceOgg(params.text);
    if (opus.length >= 80) {
      await sendTelegramVoice(configuredChat, opus, {
        replyToMessageId: params.replyToMessageId,
        pinReply: false,
      });
    }
  } catch {
    /* ignore — tekst on juba saadetud */
  }
}

function isAudioDocument(doc: TelegramFileRef): boolean {
  const mime = (doc.mime_type ?? '').toLowerCase();
  return (
    mime.startsWith('audio/') ||
    mime === 'application/ogg' ||
    mime.includes('mpeg') ||
    mime.includes('mp4') ||
    mime.includes('x-m4a')
  );
}

function audioFilenameForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'audio.mp3';
  if (m.includes('mp4') || m.includes('m4a')) return 'audio.m4a';
  return 'voice.ogg';
}

async function resolveInboundText(botToken: string, msg: TelegramMessage): Promise<{ text: string | null; skip: string }> {
  const direct = (msg.text ?? msg.caption ?? '').trim();
  if (direct) {
    return { text: direct, skip: '' };
  }

  if (msg.photo?.length) {
    return { text: null, skip: 'photo_no_text' };
  }

  if (msg.voice?.file_id) {
    await sendTelegramChatAction('record_voice');
    const buf = await downloadTelegramFile(botToken, msg.voice.file_id);
    if (!buf) {
      return { text: null, skip: 'voice_download' };
    }
    const tr = await transcribeAudioBuffer(buf, 'voice.ogg');
    if (!tr) {
      return { text: null, skip: 'voice_transcribe' };
    }
    return { text: tr, skip: '' };
  }

  if (msg.video_note?.file_id) {
    await sendTelegramChatAction('record_voice');
    const buf = await downloadTelegramFile(botToken, msg.video_note.file_id);
    if (!buf) {
      return { text: null, skip: 'voice_download' };
    }
    const tr = await transcribeAudioBuffer(buf, 'note.mp4');
    if (!tr) {
      return { text: null, skip: 'voice_transcribe' };
    }
    return { text: tr, skip: '' };
  }

  if (msg.audio?.file_id) {
    await sendTelegramChatAction('upload_voice');
    const buf = await downloadTelegramFile(botToken, msg.audio.file_id);
    if (!buf) {
      return { text: null, skip: 'audio_download' };
    }
    const name = audioFilenameForMime(msg.audio.mime_type ?? 'audio/mpeg');
    const tr = await transcribeAudioBuffer(buf, name);
    if (!tr) {
      return { text: null, skip: 'audio_transcribe' };
    }
    return { text: tr, skip: '' };
  }

  if (msg.document?.file_id && isAudioDocument(msg.document)) {
    await sendTelegramChatAction('upload_voice');
    const buf = await downloadTelegramFile(botToken, msg.document.file_id);
    if (!buf) {
      return { text: null, skip: 'audio_download' };
    }
    const name = audioFilenameForMime(msg.document.mime_type ?? 'audio/ogg');
    const tr = await transcribeAudioBuffer(buf, name);
    if (!tr) {
      return { text: null, skip: 'audio_transcribe' };
    }
    return { text: tr, skip: '' };
  }

  if (msg.document?.file_id) {
    return { text: null, skip: 'document_not_audio' };
  }

  return { text: null, skip: 'empty_payload' };
}

async function deliverTelegramChatTurn(
  raw: string,
  replyToMessageId: number | undefined,
  telegramUserId: number,
): Promise<void> {
  const zone = env.TELEGRAM_DEFAULT_TIMEZONE?.trim() || 'Europe/Tallinn';
  const todayYmd = DateTime.now().setZone(zone).toISODate() ?? undefined;
  const locale = env.TELEGRAM_DEFAULT_LOCALE?.trim() || 'ru';

  await sendTelegramChatTyping();

  const chatBody = {
    message: raw,
    history: [],
    clientTimeZone: zone,
    clientLocale: locale,
    clientLocalCalendarDate: todayYmd,
  };

  const out = await processChatRequestBody(chatBody, {
    agentInboxSource: 'telegram',
    telegramAutoJatka: true,
  });
  if (out.status === 200 && out.payload && typeof out.payload === 'object' && 'reply' in out.payload) {
    const reply = String((out.payload as { reply: string }).reply ?? '');
    const toSend =
      reply.trim().length > 0
        ? reply
        : 'Robert tagastas tühja vastust — proovi küsida teisiti või kontrolli OPENAI ühendust.\n' +
          'Пустой ответ модели — переформулируйте вопрос.';
    const sig = env.TELEGRAM_REPLY_SIGNATURE?.trim();
    const displayReply = sig && toSend.trim() ? `${sig}\n${toSend}` : toSend;
    void appendChatChannelMessage({ from: 'assistant', text: displayReply });
    await deliverTelegramUserReply({
      telegramUserId,
      text: displayReply,
      replyToMessageId,
    });
    return;
  }

  let errText = `Viga (HTTP ${out.status}).`;
  if (out.status === 503) {
    errText = 'Teenus: OpenAI võti puudub või pole saadaval.';
  } else if (out.status === 400) {
    errText = 'Sõnumit ei saanud töödelda.';
  }
  await deliverTelegramUserReply({
    telegramUserId,
    text: errText,
    replyToMessageId,
  });
}

/**
 * Telegram Bot API webhook: tekst / caption / hääl / audio-dokument; `callback_query` heli lüliti jaoks.
 */
export async function handleTelegramWebhook(req: Request, res: Response): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN?.trim() || !env.TELEGRAM_CHAT_ID?.trim()) {
    res.status(503).json({ ok: false, error: 'telegram_not_configured' });
    return;
  }

  if (!telegramWebhookSecretOk(req)) {
    logger.warn(
      {},
      'telegram webhook: 401 invalid_webhook_secret — kas .env TELEGRAM_WEBHOOK_SECRET ühtib Telegrami setWebhook secret_tokeniga?',
    );
    res.status(401).json({ ok: false, error: 'invalid_webhook_secret' });
    return;
  }

  const update = req.body as TelegramUpdate;

  if (typeof update.update_id === 'number' && isDuplicateTelegramUpdate(update.update_id)) {
    logger.info({ update_id: update.update_id }, 'telegram webhook: duplicate_update (ignored)');
    res.status(200).json({ ok: true, ignored: 'duplicate_update' });
    return;
  }

  const cq = update.callback_query;
  if (cq) {
    const chatId = cq.message?.chat.id;
    if (chatId === undefined || !chatIdAllowed(chatId)) {
      res.status(200).json({ ok: true, ignored: 'chat_not_allowed' });
      return;
    }
    if (cq.data !== 'toggle_audio') {
      res.status(200).json({ ok: true, ignored: 'callback_query' });
      return;
    }
    const next = await toggleUserAudio(cq.from.id);
    const tip = next.audio
      ? 'Audio ON — tekst + hääl.\nАудио вкл: текст + голос.'
      : 'Audio OFF — ainult tekst.\nАудио выкл: только текст.';
    await answerTelegramCallbackQuery(cq.id, { text: tip });
    res.status(200).json({ ok: true, handled: 'toggle_audio' });
    return;
  }

  const msg = update.message ?? update.edited_message;
  if (!msg) {
    res.status(200).json({ ok: true, ignored: 'no_message' });
    return;
  }

  if (!chatIdAllowed(msg.chat.id)) {
    logger.info({ chatId: msg.chat.id }, 'telegram webhook: ignored chat (not TELEGRAM_CHAT_ID)');
    res.status(200).json({ ok: true, ignored: 'chat_not_allowed' });
    return;
  }

  const botToken = env.TELEGRAM_BOT_TOKEN.trim();
  const resolved = await resolveInboundText(botToken, msg);
  const telegramUserId = telegramUserIdFromMessage(msg);

  if (!resolved.text) {
    if (resolved.skip === 'photo_no_text') {
      await deliverTelegramUserReply({
        telegramUserId,
        text:
          'Pilt ilma tekstita: lisa caption või kirjuta küsimus sõnumina — pildi sisu ei loe automaatselt.\n' +
          'Фото без подписи: добавьте подпись (caption) или напишите вопрос отдельным сообщением.',
        replyToMessageId: msg.message_id,
      });
    } else if (resolved.skip === 'document_not_audio') {
      await deliverTelegramUserReply({
        telegramUserId,
        text: 'Dokumendina toetatud on hetkel ainult audiofailid (nt ogg/m4a/mp3).',
        replyToMessageId: msg.message_id,
      });
    } else if (resolved.skip === 'voice_download' || resolved.skip === 'audio_download') {
      await deliverTelegramUserReply({
        telegramUserId,
        text: 'Faili ei saanud alla laadida. Proovi uuesti või kasuta teksti.',
        replyToMessageId: msg.message_id,
      });
    } else if (resolved.skip === 'voice_transcribe' || resolved.skip === 'audio_transcribe') {
      await deliverTelegramUserReply({
        telegramUserId,
        text:
          'Hääle transkriptsioon ebaõnnestus. Kontrolli OPENAI_API_KEY ja võrguproksi; võid proovida lühemat klippi.',
        replyToMessageId: msg.message_id,
      });
    }
    res.status(200).json({ ok: true, ignored: resolved.skip || 'empty_text' });
    return;
  }

  logger.info(
    { update_id: update.update_id, chatId: msg.chat.id, inboundChars: resolved.text.length },
    'telegram webhook: inbound text',
  );

  const audioCmd = parseAudioPreferenceCommand(resolved.text);
  if (audioCmd !== null) {
    let ack: string;
    if (audioCmd === 'on') {
      await setUserSetting(telegramUserId, { audio: true });
      ack =
        'Audio ON — vastused saadetakse teksti ja häälega.\n' +
        'Аудио вкл: ответы текстом и голосом.\n' +
        'Kasuta /audio_off või nuppu, et välja lülitada.';
    } else if (audioCmd === 'off') {
      await setUserSetting(telegramUserId, { audio: false });
      ack =
        'Audio OFF — ainult tekst.\n' +
        'Аудио выкл: только текст.\n' +
        'Kasuta /audio_on või nuppu, et sisse lülitada.';
    } else {
      const next = await toggleUserAudio(telegramUserId);
      ack = next.audio
        ? 'Audio ON (vahetatud).\nАудио вкл (переключено).'
        : 'Audio OFF (vahetatud).\nАудио выкл (переключено).';
    }
    void appendAgentInboxEntry({ source: 'telegram', text: resolved.text });
    void appendChatChannelMessage({ from: 'user', text: resolved.text });
    void appendChatChannelMessage({ from: 'assistant', text: ack });
    await deliverTelegramUserReply({
      telegramUserId,
      text: ack,
      replyToMessageId: msg.message_id,
    });
    res.status(200).json({ ok: true, handled: 'audio_preference' });
    return;
  }

  const sideReply = await tryTelegramSideCommands(resolved.text);
  if (sideReply !== null && sideReply.trim().length > 0) {
    void appendAgentInboxEntry({ source: 'telegram', text: resolved.text });
    void appendChatChannelMessage({ from: 'user', text: resolved.text });
    const sideSig = env.TELEGRAM_REPLY_SIGNATURE?.trim();
    const sideOut = sideSig && sideReply.trim() ? `${sideSig}\n${sideReply}` : sideReply;
    void appendChatChannelMessage({ from: 'assistant', text: sideOut });
    logger.info({ kind: 'side_command' }, 'telegram webhook: answered without LLM');
    await deliverTelegramUserReply({
      telegramUserId,
      text: sideOut,
      replyToMessageId: msg.message_id,
    });
    res.status(200).json({ ok: true, handled: 'side_command' });
    return;
  }

  const robertDev = await handleRobertDevCommand(resolved.text);
  if (robertDev.handled) {
    void appendAgentInboxEntry({ source: 'telegram', text: resolved.text });
    void appendChatChannelMessage({ from: 'user', text: resolved.text });
    const devSig = env.TELEGRAM_REPLY_SIGNATURE?.trim();
    const devOut = devSig && robertDev.ack.trim() ? `${devSig}\n${robertDev.ack}` : robertDev.ack;
    void appendChatChannelMessage({ from: 'assistant', text: devOut });
    logger.info({ kind: 'robert_dev' }, 'telegram webhook: dev task queued (no LLM)');
    await deliverTelegramUserReply({
      telegramUserId,
      text: devOut,
      replyToMessageId: msg.message_id,
    });
    res.status(200).json({ ok: true, handled: 'robert_dev' });
    return;
  }

  const prefixResult = applyTelegramInboundPrefix(resolved.text);
  if (!prefixResult.ok) {
    await deliverTelegramUserReply({
      telegramUserId,
      text: telegramInboundPrefixHint(),
      replyToMessageId: msg.message_id,
    });
    res.status(200).json({ ok: true, ignored: 'inbound_prefix' });
    return;
  }

  try {
    await deliverTelegramChatTurn(prefixResult.forLlm, msg.message_id, telegramUserId);
    logger.info({ update_id: update.update_id }, 'telegram webhook: llm turn completed');
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'telegram webhook: process failed');
    res.status(200).json({ ok: false, error: 'internal' });
  }
}
