import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { processChatRequestBody } from '../chat/chat.controller.js';
import { logger } from '../shared/logger/logger.js';
import type { MetaWhatsappWebhookBody } from './meta-cloud.types.js';
import { WhatsappService } from './whatsapp.service.js';

const GRAPH_DEFAULT_VERSION = 'v21.0';

function getGraphVersion(): string {
  return (env.WHATSAPP_CLOUD_GRAPH_VERSION ?? GRAPH_DEFAULT_VERSION).replace(/^v/, 'v');
}

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }
  const expectedHex = signatureHeader.slice('sha256='.length);
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, 'hex');
  } catch {
    return false;
  }
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(rawBody);
  const digest = hmac.digest();
  return expected.length === digest.length && crypto.timingSafeEqual(expected, digest);
}

export function extractTextInboundMessages(body: MetaWhatsappWebhookBody): Array<{
  from: string;
  body: string;
  messageId: string | null;
}> {
  if (body.object !== 'whatsapp_business_account') {
    return [];
  }

  const out: Array<{ from: string; body: string; messageId: string | null }> = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];
      if (messages.length === 0) {
        continue;
      }
      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body?.trim()) {
          continue;
        }
        const from = String(msg.from ?? '').replace(/\D/g, '');
        if (!from) {
          continue;
        }
        out.push({
          from,
          body: msg.text.body.trim(),
          messageId: msg.id ? String(msg.id) : null,
        });
      }
    }
  }

  return out;
}

/** Meta saadab `from` ilma +; CRM ootab numbrit (võib olla + ees). */
export function metaFromToPhoneDigits(fromDigits: string): string {
  return fromDigits.startsWith('+') ? fromDigits : `+${fromDigits}`;
}

async function sendWhatsappCloudText(toDigits: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'missing_token_or_phone_number_id' };
  }

  const to = toDigits.replace(/\D/g, '');
  const version = getGraphVersion();
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, error: errText || `http_${res.status}` };
  }
  return { ok: true };
}

function normalizeOwnerTranslationReply(llmText: string): { reply: string; langHint?: string } {
  const raw = llmText.trim();
  if (!raw) return { reply: '' };

  // Some models still add numbering (L1/L2). Strip it defensively.
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^L\d+\s*:\s*/i, '').trim());

  const etLine = lines.find((l) => /^ET\s*:/i.test(l));
  const origLine = lines.find((l) => /^ORIG\b/i.test(l));
  const langMatch = origLine?.match(/\(([^)]+)\)/);
  const lang = langMatch?.[1]?.trim().toLowerCase();

  if (!etLine) {
    // Fallback: if ET: missing, treat whole text as ET.
    return { reply: raw };
  }

  const translation = etLine.replace(/^ET\s*:\s*/i, '').trim();
  const code = lang ? lang.slice(0, 3).toUpperCase() : undefined;
  const reply = code ? `${translation}\nKEEL: ${code}` : translation;
  return { reply, langHint: lang };
}

export async function processMetaWebhookPayload(
  rawBody: Buffer,
  whatsappService: WhatsappService,
): Promise<void> {
  let parsed: MetaWhatsappWebhookBody;
  try {
    parsed = JSON.parse(rawBody.toString('utf8')) as MetaWhatsappWebhookBody;
  } catch {
    logger.warn({ bytes: rawBody.length }, 'whatsapp-cloud: webhook payload is not valid JSON (ignored)');
    return;
  }

  const items = extractTextInboundMessages(parsed);
  logger.info(
    {
      object: parsed.object,
      entryCount: parsed.entry?.length ?? 0,
      extractedTextMessages: items.length,
      bilingual: Boolean(env.WHATSAPP_BILINGUAL_REPLY),
    },
    'whatsapp-cloud: webhook received',
  );
  if (items.length === 0) {
    // Meta saadab ka muud tüüpi evente (statuses, delivery jne) — meil on vaja ainult inbound text.
    return;
  }
  for (const item of items) {
    const phone = metaFromToPhoneDigits(item.from);
    logger.info(
      { from: item.from, phone, messageId: item.messageId, chars: item.body.length },
      'whatsapp-cloud: inbound text message',
    );
    const result = await whatsappService.handleInboundMessage({
      phone,
      name: null,
      message: item.body,
      channel: 'whatsapp',
    });

    // Vaikimisi: vana loogika (pärast tööaega jms).
    // Kui WHATSAPP_BILINGUAL_REPLY=true: saada “tõlge esmalt” stiilis abisõnum:
    //   ET: <tõlge>
    //   KEEL: <xx>
    let replyText = result.status === 'ready' ? (result.replyText?.trim() ?? '') : '';
    if (env.WHATSAPP_BILINGUAL_REPLY) {
      const msgForLlm = [
        'Task: Translate the inbound WhatsApp message into Estonian for the business owner.',
        'Also detect the source language.',
        'Output format (exact, exactly 2 lines, no numbering):',
        'ET: <Estonian translation>',
        'ORIG (<lang>): <original message>',
        'Rules: preserve meaning; keep it concise; no extra lines; do not add prefixes like L1/L2.',
        '',
        item.body,
      ].join('\n');

      const out = await processChatRequestBody(
        {
          message: msgForLlm,
          history: [],
          clientTimeZone: 'Europe/Tallinn',
          clientLocale: 'es',
          clientLocalCalendarDate: undefined,
        },
        { agentInboxSource: 'whatsapp' },
      );

      if (out.status === 200 && out.payload && typeof out.payload === 'object' && 'reply' in out.payload) {
        const llmReply = String((out.payload as { reply: string }).reply ?? '').trim();
        if (llmReply) {
          replyText = normalizeOwnerTranslationReply(llmReply).reply;
        }
      }
    }

    if (!replyText) {
      logger.info({ from: item.from, messageId: item.messageId }, 'whatsapp-cloud: no reply text (skipped)');
      continue;
    }

    logger.info({ to: item.from, messageId: item.messageId, chars: replyText.length }, 'whatsapp-cloud: sending reply');
    const sendResult = await sendWhatsappCloudText(item.from, replyText);
    if (!sendResult.ok) {
      logger.warn({ err: sendResult.error }, 'whatsapp-cloud: send reply failed');
    } else {
      logger.info({ to: item.from, messageId: item.messageId }, 'whatsapp-cloud: reply sent');
    }
  }
}
