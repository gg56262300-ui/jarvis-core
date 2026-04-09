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

describe('reminder routing', () => {
  it('creates reminder', async () => {
    const result = await callVoice('lisa meeldetuletus homme kell 18 test reminder');
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).toMatch(/Tegin meeldetuletuse:/);
    expect(combined).toContain('test reminder');
  });

  it('shows reminders', async () => {
    const result = await callVoice('näita meeldetuletusi');
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).toMatch(/aktiivset meeldetuletust|aktiivset meeldetuletust:|Sul ei ole praegu ühtegi aktiivset meeldetuletust/);
  });
});
