import { synthesizeOpenAiSpeechOpus } from '../integrations/telegram/telegram-tts.js';

/**
 * TTS → OGG Opus buffer suitable for Telegram `sendVoice`.
 * Swap implementation here (ElevenLabs, etc.) without changing callers.
 */
export async function generateVoiceOgg(text: string): Promise<Buffer> {
  const buf = await synthesizeOpenAiSpeechOpus(text);
  if (!buf || buf.length === 0) {
    return Buffer.alloc(0);
  }
  return buf;
}
