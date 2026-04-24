import type { Request, Response } from 'express';

import { env } from '../../config/index.js';
import {
  fetchTelegramBotUsernameSafe,
  fetchTelegramWebhookInfoSafe,
  isTelegramPinBotReplyEnabled,
  isTelegramVoiceReplyEnabled,
} from './telegram.client.js';

/**
 * Diagnostika ilma saladuste lekketa (tokenit / chat_id väärtusi ei tagastata).
 * Lisa `?webhook=1`, et server küsiks `getWebhookInfo` (URL + ootel uuendused + viimane viga) ja `getMe` (boti @username).
 * Ilma webhookita: `?me=1` kutsub ainult `getMe` (väiksem koormus kui täielik status).
 */
export async function getTelegramIntegrationStatus(req: Request, res: Response): Promise<void> {
  const hasToken = Boolean(env.TELEGRAM_BOT_TOKEN?.trim());
  const hasChat = Boolean(env.TELEGRAM_CHAT_ID?.trim());
  const hasSecret = Boolean(env.TELEGRAM_WEBHOOK_SECRET?.trim());
  const hasOpenAi = Boolean(env.OPENAI_API_KEY?.trim());

  const wantWebhook = req.query.webhook === '1' || req.query.webhook === 'true';
  const wantBotMeta = wantWebhook || req.query.me === '1' || req.query.me === 'true';

  let webhookInfo = null;
  let botUsername: string | null = null;
  if (wantWebhook && hasToken) {
    [webhookInfo, botUsername] = await Promise.all([
      fetchTelegramWebhookInfoSafe(),
      fetchTelegramBotUsernameSafe(),
    ]);
  } else if (wantBotMeta && hasToken) {
    botUsername = await fetchTelegramBotUsernameSafe();
  }

  res.json({
    ok: true,
    inbound: {
      ready: hasToken && hasChat,
      webhookPath: '/api/integrations/telegram/webhook',
      webhookSecretEnabled: hasSecret,
      webhookRecommendedSecret: !hasSecret,
      textMessages: hasToken && hasChat,
      voiceTranscriptionReady: hasToken && hasChat && hasOpenAi,
      chatLlmReady: hasToken && hasChat && hasOpenAi,
      chatCompletionModel: hasOpenAi ? env.JARVIS_CHAT_COMPLETION_MODEL : null,
      videoNoteTranscriptionReady: hasToken && hasChat && hasOpenAi,
      audioMessageTranscriptionReady: hasToken && hasChat && hasOpenAi,
      photoCaptionInbound: hasToken && hasChat,
      longReplyMultipart: hasToken && hasChat,
      editedMessageSupported: hasToken && hasChat,
      typingIndicator: hasToken && hasChat,
      duplicateUpdateDedup: hasToken && hasChat,
      pinLastBotReply: hasToken && hasChat && isTelegramPinBotReplyEnabled(),
      longPolling: Boolean(env.TELEGRAM_USE_POLLING),
      voiceReplyEnabled: hasToken && hasChat && isTelegramVoiceReplyEnabled(),
      voiceReplyTtsReady: hasToken && hasChat && hasOpenAi && isTelegramVoiceReplyEnabled(),
      ttsModel: hasOpenAi && isTelegramVoiceReplyEnabled() ? env.TELEGRAM_TTS_MODEL ?? 'tts-1' : null,
      ttsVoice: hasOpenAi && isTelegramVoiceReplyEnabled() ? env.TELEGRAM_TTS_VOICE ?? 'nova' : null,
      inboundPrefixRequired:
        hasToken && hasChat && env.TELEGRAM_INBOUND_PREFIX_REQUIRED === true && Boolean(env.TELEGRAM_INBOUND_PREFIX?.trim()),
      inboundPrefix: env.TELEGRAM_INBOUND_PREFIX?.trim() || null,
      replySignatureSet: Boolean(env.TELEGRAM_REPLY_SIGNATURE?.trim()),
      inlineKeyboard: false,
    },
    outbound: {
      sendMessageReady: hasToken && hasChat,
      sendVoiceReady: hasToken && hasChat,
    },
    timezoneDefault: env.TELEGRAM_DEFAULT_TIMEZONE?.trim() || 'Europe/Tallinn',
    localeDefault: env.TELEGRAM_DEFAULT_LOCALE?.trim() || 'ru',
    botUsername: botUsername ? `@${botUsername}` : null,
    webhookInfo,
  });
}
