import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// PM2/shell may set empty env keys; default dotenv does not overwrite them, so .env would be ignored.
dotenv.config({ override: true });

/** Kui PM2 jätab OPENAI_API_KEY tühjaks, aga võti on failis (nt `data/openai-api-key.txt`). */
(() => {
  const keyFile = (process.env.OPENAI_API_KEY_FILE || '').trim();
  if (!keyFile) return;
  try {
    const abs = path.isAbsolute(keyFile) ? keyFile : path.resolve(process.cwd(), keyFile);
    const raw = fs.readFileSync(abs, 'utf8').trim().replace(/^\uFEFF/, '');
    if (!raw) return;
    const existing = (process.env.OPENAI_API_KEY || '').trim();
    if (!existing) process.env.OPENAI_API_KEY = raw;
  } catch {
    /* fail puudub või õigused */
  }
})();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DB_PATH: z.string().min(1).default('./data/jarvis.sqlite'),
  /** Kui tühi, võib täita OPENAI_API_KEY_FILE abil (enne zod parse’i). */
  OPENAI_API_KEY_FILE: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return undefined;
      const t = value.trim().replace(/^\uFEFF/, '');
      return t.length > 0 ? t : undefined;
    }),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return undefined;
      const t = value.trim().replace(/^\uFEFF/, '');
      return t.length > 0 ? t : undefined;
    }),
  /** Mitme org puhul või kui dashboard nõuab — vale väärtus annab 401. */
  OPENAI_ORG_ID: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return undefined;
      const t = value.trim().replace(/^\uFEFF/, '');
      return t.length > 0 ? t : undefined;
    }),
  /** Projektivõtme (`sk-proj-…`) korral võib olla kohustuslik — vt OpenAI dashboard. */
  OPENAI_PROJECT_ID: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return undefined;
      const t = value.trim().replace(/^\uFEFF/, '');
      return t.length > 0 ? t : undefined;
    }),
  /** Näiteks puhverserver / Azure stiilis otspunkt; tühi = vaikimisi api.openai.com. */
  OPENAI_BASE_URL: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return undefined;
      const t = value.trim().replace(/^\uFEFF/, '');
      return t.length > 0 ? t : undefined;
    }),
  /**
   * Roberti vestlus (`/api/chat`, Telegram webhook) — `chat.completions` mudel.
   * Vaikimisi `gpt-4o-mini`. Muu otspunkt (nt DeepSeek OpenAI-ühilduv): sea `OPENAI_BASE_URL` + võti ning siin mudel, nt `deepseek-chat`.
   */
  JARVIS_CHAT_COMPLETION_MODEL: z
    .string()
    .optional()
    .transform((value) => {
      const t = value?.trim().replace(/^\uFEFF/, '') ?? '';
      return t.length > 0 ? t : 'gpt-4o-mini';
    }),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_GMAIL_REDIRECT_URI: z.string().optional(),
  GOOGLE_CONTACTS_REDIRECT_URI: z.string().optional(),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().optional(),
  GOOGLE_PROJECT_ID: z.string().optional(),
  GOOGLE_WORKSPACE_USER: z.string().optional(),
  VOICE_PROVIDER_API_KEY: z.string().optional(),
  CRM_PROVIDER_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  REDIS_QUEUE_PREFIX: z.string().default('jarvis'),
  MAKE_WEBHOOK_URL: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
  MAKE_WEBHOOK_TEST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  MAKE_WEBHOOK_NOTIFY_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  MAKE_WEBHOOK_FAILED_INSPECT_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  /** Bot API setWebhook `secret_token` — sissetulevad päringud peavad kandma `X-Telegram-Bot-Api-Secret-Token`. */
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  /** Pärast boti vastuse saatmist `pinChatMessage` (viimane tükk mitmesõnumilisel vastusel) — nähtav ülaosas; `false` / `0` / `off` välja. */
  TELEGRAM_PIN_BOT_REPLY: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') {
        return true;
      }
      const t = value.trim().toLowerCase();
      return t !== 'false' && t !== '0' && t !== 'off' && t !== 'no';
    }),
  /** Roberti Telegrami vastus ka häälsõnumina (OpenAI `audio/speech` → `sendVoice`). */
  TELEGRAM_VOICE_REPLY: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  /** OpenAI TTS mudel (nt `tts-1`, `gpt-4o-mini-tts` kui teenus toetab). */
  TELEGRAM_TTS_MODEL: z
    .string()
    .optional()
    .transform((value) => {
      const t = value?.trim().replace(/^\uFEFF/, '') ?? '';
      return t.length > 0 ? t : undefined;
    }),
  /** OpenAI TTS hääl (nt alloy, nova, shimmer). */
  TELEGRAM_TTS_VOICE: z
    .string()
    .optional()
    .transform((value) => {
      const t = value?.trim().replace(/^\uFEFF/, '') ?? '';
      return t.length > 0 ? t : undefined;
    }),
  /**
   * Kui true ja `TELEGRAM_INBOUND_PREFIX` on seatud — ainult selle eesliitega sõnumid lähevad Robertile
   * (/ping, /jarvis jäävad vabaks).
   */
  TELEGRAM_INBOUND_PREFIX_REQUIRED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  /** Nt Jarvis või JV — sissetuleva sõnumi algus enne küsimust. */
  TELEGRAM_INBOUND_PREFIX: z
    .string()
    .optional()
    .transform((value) => {
      const t = value?.trim().replace(/^\uFEFF/, '') ?? '';
      return t.length > 0 ? t : undefined;
    }),
  /** Assistendi vastuse ette rida (nt ▸ Jarvis) — eristab serveri vastust. */
  TELEGRAM_REPLY_SIGNATURE: z
    .string()
    .optional()
    .transform((value) => {
      const t = value?.trim().replace(/^\uFEFF/, '') ?? '';
      return t.length > 0 ? t : undefined;
    }),
  /** Kui true, siis Telegramis vastatakse kahes keeles: kasutaja keeles + eesti tõlge. */
  TELEGRAM_BILINGUAL_REPLY: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  /** Telegrami vestluse «täna» ankur (IANA), kui brauserit pole. */
  TELEGRAM_DEFAULT_TIMEZONE: z.string().optional(),
  /** Roberti süsteemviiba keel (nt `ru`, `et-EE`) — Telegrami webhook seab selle vaikimisi. */
  TELEGRAM_DEFAULT_LOCALE: z.string().optional(),
  /** Avalik HTTPS origina (ilma lõpupõikketa) — `npm run telegram:set-webhook` koostab webhooki URL-i. */
  JARVIS_WEBHOOK_PUBLIC_BASE: z.string().optional(),
  /**
   * `true` / `1`: küsib Telegramist `getUpdates` ja edastab kohalikule webhookile (sobib Macis ilma tunnelita).
   * Käivitamisel `deleteWebhook` — ära kasuta samaaegselt avaliku URL-iga webhookiga (üks tarbija).
   */
  TELEGRAM_USE_POLLING: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  PUSH_PAIR_CODE: z.string().optional(),
  PUSH_SUBJECT: z.string().optional(),
  PUSH_SUBSCRIPTIONS_PATH: z.string().optional(),
  PUSH_VAPID_KEYS_PATH: z.string().optional(),
  PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  /** Meta WhatsApp Cloud API — veebihooki kinnituse token (Meta dashboard → Webhook). */
  WHATSAPP_CLOUD_VERIFY_TOKEN: z.string().optional(),
  /** Meta rakenduse salajane võti — X-Hub-Signature-256 kontrolliks. */
  WHATSAPP_CLOUD_APP_SECRET: z.string().optional(),
  /** Ajutine test-lipp: kui true/1, siis webhook signature kontroll jäetakse vahele (mitte tootmises). */
  WHATSAPP_CLOUD_SKIP_SIGNATURE_VERIFY: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  /** Graph API püsiva või ajutise juurdepääsu token (sõnumite saatmiseks). */
  WHATSAPP_CLOUD_ACCESS_TOKEN: z.string().optional(),
  /** WhatsApp Business telefoninumbri ID (Graph API URL-is). */
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_CLOUD_GRAPH_VERSION: z.string().optional(),
  /** Kui true, siis WhatsAppis vastatakse kahes keeles: kasutaja keeles + eesti tõlge. */
  WHATSAPP_BILINGUAL_REPLY: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  /** Kui seatud, lubatakse /api/agent-inbox ja chat sõnumite jälg `logs/agent-inbox.jsonl` faili. */
  JARVIS_AGENT_INBOX_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(process.env);

