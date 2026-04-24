import { env } from '../../config/env.js';
import { logger } from '../../shared/logger/logger.js';

const TELEGRAM_API = 'https://api.telegram.org';
/** Telegrami hääl võib olla suur; Whisperi jaoks piisab esimesest ~2 MiB-st. */
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;

export async function downloadTelegramFile(botToken: string, fileId: string): Promise<Buffer | null> {
  const metaUrl = `${TELEGRAM_API}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const r1 = await fetch(metaUrl);
  if (!r1.ok) {
    logger.warn({ status: r1.status }, 'telegram getFile failed');
    return null;
  }
  const j = (await r1.json()) as { ok?: boolean; result?: { file_path?: string } };
  if (!j.ok || !j.result?.file_path) {
    return null;
  }
  const fileUrl = `${TELEGRAM_API}/file/bot${botToken}/${j.result.file_path}`;
  const r2 = await fetch(fileUrl);
  if (!r2.ok) {
    logger.warn({ status: r2.status }, 'telegram file download failed');
    return null;
  }
  const buf = Buffer.from(await r2.arrayBuffer());
  if (buf.length > MAX_DOWNLOAD_BYTES) {
    logger.warn({ size: buf.length }, 'telegram voice: file too large');
    return null;
  }
  return buf;
}

function openAiTranscriptionsUrl(): string {
  const raw = env.OPENAI_BASE_URL?.trim();
  if (raw) {
    const base = raw.replace(/\/$/, '');
    return `${base}/audio/transcriptions`;
  }
  return 'https://api.openai.com/v1/audio/transcriptions';
}

/**
 * OpenAI Whisper — ogg/opus/m4a jms, kui OPENAI_API_KEY on olemas.
 */
export async function transcribeAudioBuffer(buffer: Buffer, filename: string): Promise<string | null> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) {
    return null;
  }

  const form = new FormData();
  form.append('model', 'whisper-1');
  const copy = new Uint8Array(buffer.length);
  copy.set(buffer);
  const file = new Blob([copy], { type: 'application/octet-stream' });
  form.append('file', file, filename);

  try {
    const res = await fetch(openAiTranscriptionsUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'telegram whisper: transcription failed');
      return null;
    }
    const data = (await res.json()) as { text?: string };
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    return text.length > 0 ? text : null;
  } catch (err) {
    logger.warn({ err }, 'telegram whisper: transcription error');
    return null;
  }
}
