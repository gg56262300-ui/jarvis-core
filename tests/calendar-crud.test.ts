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
  const title = 'VITEST KALENDER TEST';

  it('creates calendar event', async () => {
    const result = await callVoice(`lisa kalendrisse homme kell 10 kuni 11 ${title}`);
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).toMatch(/Kalendrisse lisatud:/);
    expect(combined).toContain(title);
  });

  it('updates calendar event', async () => {
    const result = await callVoice(`muuda kalendris ${title} homme kell 12 kuni 13`);
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).toMatch(/Kalendris muudetud:/);
    expect(combined).toContain(title);
  });

  it('deletes calendar event', async () => {
    const result = await callVoice(`kustuta kalendrist ${title}`);
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).toMatch(/Kalendrist kustutatud:/);
    expect(combined).toContain(title);
  });
});
