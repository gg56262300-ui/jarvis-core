import { env } from '../../config/env.js';

/**
 * Kui .env on ainult `http://localhost` või `http://127.0.0.1` (nagu vanas seadistuses),
 * kasuta kohalikku tagasisuunamist, mis sobib Gmaili/People OAuth-iga.
 * Kalender kasutab eraldi loogikat (callback /api/calendar/...).
 */
export function resolveGmailStyleRedirectUri(): string {
  const port = Number(env.PORT ?? 3000) || 3000;
  const raw = env.GOOGLE_REDIRECT_URI?.trim() ?? '';
  if (raw === 'http://localhost' || raw === 'http://127.0.0.1') {
    return `http://127.0.0.1:${port}/oauth2/google`;
  }
  return raw;
}
