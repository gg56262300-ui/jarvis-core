import { env } from '../../config/env.js';

export type GoogleOAuthKind = 'gmail' | 'contacts' | 'calendar';

function resolveFallbackLocalhost(pathname: string): string {
  const port = Number(env.PORT ?? 3000) || 3000;
  return `http://127.0.0.1:${port}${pathname}`;
}

function normalizeRedirectValue(raw: string | undefined, localhostPath: string): string {
  const value = raw?.trim() ?? '';
  if (!value) return '';
  if (value === 'http://localhost' || value === 'http://127.0.0.1') {
    return resolveFallbackLocalhost(localhostPath);
  }
  return value;
}

/**
 * Gmail/Contacts kasutavad vaikimisi `/oauth2/google`; kalender kasutab `/api/calendar/google/callback`.
 * Produktsioonis soovitame määrata eraldi *_REDIRECT_URI, et teenused ei segaks üksteist.
 */
export function resolveGoogleRedirectUri(kind: GoogleOAuthKind): string {
  const legacy = env.GOOGLE_REDIRECT_URI;
  if (kind === 'calendar') {
    const specific = normalizeRedirectValue(env.GOOGLE_CALENDAR_REDIRECT_URI, '/api/calendar/google/callback');
    return specific || normalizeRedirectValue(legacy, '/api/calendar/google/callback');
  }
  if (kind === 'gmail') {
    const specific = normalizeRedirectValue(env.GOOGLE_GMAIL_REDIRECT_URI, '/oauth2/google');
    return specific || normalizeRedirectValue(legacy, '/oauth2/google');
  }
  const specific = normalizeRedirectValue(env.GOOGLE_CONTACTS_REDIRECT_URI, '/oauth2/google');
  return specific || normalizeRedirectValue(legacy, '/oauth2/google');
}

