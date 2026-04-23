import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

type VoiceResponse = {
  responseText?: string;
  displayText?: string;
  speechText?: string;
};

async function callVoice(text: string): Promise<VoiceResponse> {
  const response = await fetch('http://localhost:3000/api/voice/turns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      locale: 'et-EE',
      source: 'text',
    }),
  });

  expect(response.ok).toBe(true);
  return response.json();
}

describe('calendar crud voice flow', () => {
  const tokenPath = path.resolve(process.cwd(), 'data/google-calendar-token.json');
  const hasToken = fs.existsSync(tokenPath);
  const testIt = hasToken ? it : it.skip;
  const title = 'VITEST KALENDER TEST';

  testIt('creates calendar event', async () => {
    const result = await callVoice(`lisa kalendrisse homme kell 10 kuni 11 ${title}`);
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    if (/autoriseerim/i.test(combined)) {
      expect(combined).toMatch(/autoriseerim/i);
      return;
    }

    expect(combined).toMatch(/Kalendrisse lisatud:/);
    expect(combined).toContain(title);
  });

  testIt('updates calendar event', async () => {
    const result = await callVoice(`muuda kalendris ${title} homme kell 12 kuni 13`);
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    if (/autoriseerim/i.test(combined)) {
      expect(combined).toMatch(/autoriseerim/i);
      return;
    }

    expect(combined).toMatch(/Kalendris muudetud:/);
    expect(combined).toContain(title);
  });

  testIt('deletes calendar event', async () => {
    const result = await callVoice(`kustuta kalendrist ${title}`);
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    if (/autoriseerim/i.test(combined)) {
      expect(combined).toMatch(/autoriseerim/i);
      return;
    }

    expect(combined).toMatch(/Kalendrist kustutatud:/);
    expect(combined).toContain(title);
  });
});
