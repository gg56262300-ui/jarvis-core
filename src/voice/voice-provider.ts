import OpenAI from 'openai';

import { env } from '../config/env.js';
import { logger } from '../shared/logger/logger.js';
import { VOICE_SYSTEM_PROMPT } from './prompts/voice-system.prompt.js';
import type { VoiceTurnInput, VoiceTurnResult } from './voice.types.js';

export interface VoiceAssistantProvider {
  respond(input: VoiceTurnInput): Promise<VoiceTurnResult>;
}

export class StubEstonianVoiceAssistantProvider implements VoiceAssistantProvider {
  async respond(input: VoiceTurnInput): Promise<VoiceTurnResult> {
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

export class OpenAiVoiceAssistantProvider implements VoiceAssistantProvider {
  private readonly client: OpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY puudub .env failist');
    }

    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  async respond(input: VoiceTurnInput): Promise<VoiceTurnResult> {
    const startedAt = Date.now();

    const completion = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: VOICE_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: input.text,
        },
      ],
    });

    logger.info(
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        operation: 'voice.respond',
        durationMs: Date.now() - startedAt,
      },
      'External API latency',
    );

    const responseText =
      completion.choices[0]?.message?.content?.trim() ||
      'Sain su sõnumi kätte, aga vastus jäi tühjaks.';

    return {
      transcript: input.text.trim(),
      responseText,
      locale: input.locale,
      inputMode: input.source,
      outputMode: 'text',
      status: 'speaking',
    };
  }
}
