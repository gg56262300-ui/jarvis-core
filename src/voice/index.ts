import { Router, type Express } from 'express';

import { VoiceController } from './voice.controller.js';
import { OpenAiVoiceAssistantProvider } from './voice-provider.js';
import { VoiceService } from './voice.service.js';

const buildVoiceRouter = () => {
  const router = Router();
  const voiceAssistantProvider = new OpenAiVoiceAssistantProvider();
  const voiceService = new VoiceService(voiceAssistantProvider);
  const voiceController = new VoiceController(voiceService);

  router.get('/capabilities', (request, response) => {
    voiceController.getCapabilities(request, response);
  });

  router.post('/turns', (request, response) => {
    voiceController.createTurn(request, response);
  });

  return router;
};

export const registerVoiceModule = (app: Express) => {
  app.use('/api/voice', buildVoiceRouter());
};