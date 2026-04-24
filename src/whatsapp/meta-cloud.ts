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

export async function processMetaWebhookPayload(
  rawBody: Buffer,
  whatsappService: WhatsappService,
): Promise<void> {
  let parsed: MetaWhatsappWebhookBody;
  try {
    parsed = JSON.parse(rawBody.toString('utf8')) as MetaWhatsappWebhookBody;
  } catch {
    return;
  }

  const items = extractTextInboundMessages(parsed);
  for (const item of items) {
    const phone = metaFromToPhoneDigits(item.from);
    const result = await whatsappService.handleInboundMessage({
      phone,
      name: null,
      message: item.body,
      channel: 'whatsapp',
    });

    // Vastus kasutajale: vaikimisi sama loogika nagu enne (pärast tööaega jms).
    // Kui WHATSAPP_BILINGUAL_REPLY=true, siis küsime LLM-ilt lühikese vastuse kahes keeles (kasutaja keel + ET tõlge).
    let replyText = result.status === 'ready' ? (result.replyText?.trim() ?? '') : '';
    if (env.WHATSAPP_BILINGUAL_REPLY) {
      const msgForLlm = [
        'Task: reply to the user message.',
        'Output format (exact):',
        'L1: Reply in the same language as the user used.',
        'L2: ET: <Estonian translation of your reply>',
        'Rules: keep it short; preserve tone; no extra headings.',
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
          replyText = llmReply;
        }
      }
    }

    if (!replyText) {
      continue;
    }

    const sendResult = await sendWhatsappCloudText(item.from, replyText);
    if (!sendResult.ok) {
      logger.warn({ err: sendResult.error }, 'whatsapp-cloud: send reply failed');
    }
  }
}
