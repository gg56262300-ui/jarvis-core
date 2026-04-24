import { env } from '../../config/env.js';
import { logger } from '../../shared/logger/logger.js';

const TTS_INPUT_MAX = 4096;

function openAiSpeechUrl(): string {
  const raw = env.OPENAI_BASE_URL?.trim();
  if (raw) {
    return `${raw.replace(/\/$/, '')}/audio/speech`;
  }
  return 'https://api.openai.com/v1/audio/speech';
}

/**
 * OpenAI `audio/speech` → OGG Opus (Telegrami `sendVoice` jaoks).
 */
export async function synthesizeOpenAiSpeechOpus(text: string): Promise<Buffer | null> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) {
    return null;
  }
  const input = text.trim().slice(0, TTS_INPUT_MAX);
  if (!input) {
    return null;
  }
  const model = env.TELEGRAM_TTS_MODEL?.trim() || 'tts-1';
  const voice = env.TELEGRAM_TTS_VOICE?.trim() || 'nova';

  try {
    const res = await fetch(openAiSpeechUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input,
        response_format: 'opus',
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: errText.slice(0, 300) }, 'telegram TTS: audio/speech failed');
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch (err) {
    logger.warn({ err }, 'telegram TTS: audio/speech error');
    return null;
  }
}
