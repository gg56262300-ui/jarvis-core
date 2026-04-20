/**
 * Käivita serveris (või Macis) projekti juurkas:
 *   npm run check:openai-auth
 * Ei prindi võtit; exit 0 = autentimine OK, exit 1 = viga.
 */
import { createJarvisOpenAI } from '../src/shared/openai/jarvis-openai-client.js';
import { env } from '../src/config/env.js';

async function main() {
  if (!env.OPENAI_API_KEY) {
    console.error('FAIL: OPENAI_API_KEY puudub või on tühi pärast .env laadimist.');
    process.exit(1);
  }

  try {
    const client = createJarvisOpenAI({ timeoutMs: 20_000, maxRetries: 0 });
    await client.models.list({ limit: 1 });
    console.log('OK: OpenAI autentimine ja API vastus — võti ning org/projekt (kui vaja) on kooskõlas.');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('FAIL: OpenAI päring ebaõnnestus.');
    console.error(msg);
    console.error(
      'Kontrolli VPS .env: OPENAI_API_KEY, vajadusel OPENAI_PROJECT_ID / OPENAI_ORG_ID; eemalda tühjad või vanad väärtused. Seejärel: pm2 restart jarvis --update-env',
    );
    process.exit(1);
  }
}

void main();
