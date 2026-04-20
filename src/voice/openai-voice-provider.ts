import OpenAI from 'openai';

import { env } from '../config/env.js';
import { createJarvisOpenAI } from '../shared/openai/jarvis-openai-client.js';
import { logger } from '../shared/logger/logger.js';
import { VOICE_SYSTEM_PROMPT } from './prompts/voice-system.prompt.js';
import type { VoiceTurnInput, VoiceTurnResult } from './voice.types.js';

export class OpenAiVoiceAssistantProvider {
  private readonly client: OpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY puudub .env failist');
    }

    this.client = createJarvisOpenAI();
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