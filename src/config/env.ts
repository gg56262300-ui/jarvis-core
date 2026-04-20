import dotenv from 'dotenv';
import { z } from 'zod';

// PM2/shell may set empty env keys; default dotenv does not overwrite them, so .env would be ignored.
dotenv.config({ override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DB_PATH: z.string().min(1).default('./data/jarvis.sqlite'),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
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
  /** Graph API püsiva või ajutise juurdepääsu token (sõnumite saatmiseks). */
  WHATSAPP_CLOUD_ACCESS_TOKEN: z.string().optional(),
  /** WhatsApp Business telefoninumbri ID (Graph API URL-is). */
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_CLOUD_GRAPH_VERSION: z.string().optional(),
  /** Kui seatud, lubatakse /api/agent-inbox ja chat sõnumite jälg `logs/agent-inbox.jsonl` faili. */
  JARVIS_AGENT_INBOX_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(process.env);

