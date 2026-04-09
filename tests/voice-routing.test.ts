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

describe('voice routing', () => {
  it('calendar today should not route to calculator', async () => {
    const result = await callVoice('mis mul täna kalendris on');
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).not.toContain('Palun ütle lihtne arvutus');
    expect(combined).toMatch(/Tänased kalendrisündmused|Täna on sul/);
  });

  it('calendar next should not fall back to AI', async () => {
    const result = await callVoice('mis on minu järgmine kalendrisündmus');
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).not.toContain('Palun ütle lihtne arvutus');
    expect(combined).not.toMatch(/Kahjuks ei saa ma|Kahjuks ei pääse ma|kalendri rakendust|märkmikku/i);
  });

  it('calculator should still work', async () => {
    const result = await callVoice('arvuta 2 pluss 2');
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    expect(combined).toContain('Vastus on');
  });
});
