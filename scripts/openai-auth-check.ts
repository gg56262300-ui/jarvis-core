/**
 * Käivita serveris (või Macis) projekti juurkas:
 *   npm run check:openai-auth
 * Ei prindi võtit; exit 0 = autentimine OK, exit 1 = viga.
 */
import { createJarvisOpenAI } from '../src/shared/openai/jarvis-openai-client.js';
import { env } from '../src/config/env.js';

async function main() {
  if (!env.OPENAI_API_KEY) {
    console.error('FAIL: OPENAI_API_KEY_EMPTY');
    process.exit(1);
  }

  try {
    const client = createJarvisOpenAI({ timeoutMs: 20_000, maxRetries: 0 });
    await client.models.list({ limit: 1 });
    console.log('OK');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    const reason =
      lower.includes('401') || lower.includes('unauthorized') || lower.includes('authentication')
        ? 'OPENAI_AUTH_FAILED'
        : lower.includes('403') || lower.includes('forbidden')
          ? 'OPENAI_FORBIDDEN'
          : lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('getaddrinfo')
            ? 'OPENAI_DNS_FAILED'
            : lower.includes('timeout') || lower.includes('etimedout')
              ? 'OPENAI_TIMEOUT'
              : 'OPENAI_CALL_FAILED';
    console.error(`FAIL: ${reason}`);
    console.error(msg);
    process.exit(1);
  }
}

void main();
