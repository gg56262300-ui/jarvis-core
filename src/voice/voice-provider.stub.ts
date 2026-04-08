import type { VoiceTurnInput, VoiceTurnResult } from './voice.types.js';

export interface VoiceAssistantProvider {
  respond(input: VoiceTurnInput): VoiceTurnResult;
}

export class StubEstonianVoiceAssistantProvider implements VoiceAssistantProvider {
  respond(input: VoiceTurnInput): VoiceTurnResult {
    const transcript = input.text.trim();
    const normalized = transcript.toLowerCase();
    let responseText =
      'Sain su sõnumi kätte. Häälkiht töötab ja järgmise sammuna saab selle ühendada päris kõnetuvastuse, kõnesünteesi ja Jarvise töövoogudega.';

    if (normalized.includes('meeldetulet')) {
      responseText =
        'Mõistan, et see puudutab meeldetuletusi. Järgmise sammuna saame selle siduda olemasoleva meeldetuletuste mooduliga.';
    } else if (normalized.includes('gmail') || normalized.includes('email') || normalized.includes('e-kiri')) {
      responseText =
        'Sain aru, et soovid kasutada e-posti. Gmaili ühendus tuleb järgmises etapis, kuid häälpaneel on selle jaoks nüüd valmis.';
    } else if (normalized.includes('kalender') || normalized.includes('kohtumine')) {
      responseText =
        'See kõlab nagu kalendri päring. Järgmises etapis saame ühendada häälsisendi kalendri ja ajastamise töövoogudega.';
    } else if (normalized.includes('tere') || normalized.includes('tsau')) {
      responseText = 'Tere. Mina olen Jarvis. Olen valmis sind eesti keeles aitama.';
    }

    return {
      transcript,
      responseText,
      locale: 'et-EE',
      inputMode: input.source,
      outputMode: 'text',
      status: 'speaking',
    };
  }
}

