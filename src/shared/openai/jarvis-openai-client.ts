import OpenAI from 'openai';

import { env } from '../../config/env.js';

export type JarvisOpenAIClientOptions = {
  timeoutMs?: number;
  maxRetries?: number;
};

/**
 * Ühtne OpenAI klient: võti + valikuline org/projekt/baseURL tulevad `env`-ist
 * (vt `src/config/env.ts`). Tühi org/projekt → `null`, et ei jääks tühja stringi päisesse.
 */
export function createJarvisOpenAI(options: JarvisOpenAIClientOptions = {}): OpenAI {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY puudub .env failist');
  }

  const organization = env.OPENAI_ORG_ID ? env.OPENAI_ORG_ID : null;
  const project = env.OPENAI_PROJECT_ID ? env.OPENAI_PROJECT_ID : null;
  const baseURL = env.OPENAI_BASE_URL;

  return new OpenAI({
    apiKey,
    organization,
    project,
    ...(baseURL ? { baseURL } : {}),
    timeout: options.timeoutMs ?? 120_000,
    maxRetries: options.maxRetries ?? 2,
  });
}
