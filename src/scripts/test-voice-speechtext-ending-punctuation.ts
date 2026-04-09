import assert from 'node:assert/strict';

import { applyVoiceOutputFormatting } from '../voice/voice-output.formatter.js';
import type { VoiceTurnResult } from '../voice/voice.types.js';

const assertNoDuplicatedEndingPunctuation = (speechText: string) => {
  assert.ok(
    !/[.!?]{2,}\s*$/u.test(speechText),
    `speechText must not end with duplicated punctuation, got: ${JSON.stringify(speechText)}`,
  );
};

const base: VoiceTurnResult = {
  transcript: 'x',
  responseText: 'x',
  locale: 'et-EE',
  inputMode: 'text',
  outputMode: 'text',
  status: 'speaking',
};

{
  const result = applyVoiceOutputFormatting({
    ...base,
    speechText: 'Sul ei ole täna ühtegi kalendrisündmust..',
  });
  assertNoDuplicatedEndingPunctuation(result.speechText ?? '');
}

{
  const result = applyVoiceOutputFormatting({
    ...base,
    speechText: 'Hoiatus!!',
  });
  assertNoDuplicatedEndingPunctuation(result.speechText ?? '');
}

{
  const result = applyVoiceOutputFormatting({
    ...base,
    speechText: 'Kas kõik on korras??',
  });
  assertNoDuplicatedEndingPunctuation(result.speechText ?? '');
}

{
  const result = applyVoiceOutputFormatting({
    ...base,
    responseText: 'Tänased kalendrisündmused on: Sul ei ole täna ühtegi kalendrisündmust.',
  });
  assertNoDuplicatedEndingPunctuation(result.speechText ?? '');
}

console.log('OK: no duplicated ending punctuation in speechText');

