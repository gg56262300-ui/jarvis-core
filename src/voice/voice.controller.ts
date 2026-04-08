import type { Request, Response } from 'express';

import { validateRequestBody } from '../shared/http/validate.js';
import { applyVoiceOutputFormatting } from './voice-output.formatter.js';
import { voiceTurnSchema } from './voice.schemas.js';
import type { VoiceService } from './voice.service.js';

export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  getCapabilities(_request: Request, response: Response) {
    response.json(this.voiceService.getCapabilities());
  }

  async createTurn(request: Request, response: Response) {
    const input = validateRequestBody(voiceTurnSchema, request, 'Vigane häälpäringu sisu');
    const result = await this.voiceService.createTurn({
      text: input.text,
      locale: input.locale ?? 'et-EE',
      source: input.source ?? 'text',
    });

    response.json(applyVoiceOutputFormatting(result));
  }
}