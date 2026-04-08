import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

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
});

export const env = envSchema.parse(process.env);

