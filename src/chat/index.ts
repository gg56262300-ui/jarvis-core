import type { Express } from 'express';
import { handleChat } from './chat.controller.js';

export function registerChatModule(app: Express) {
  app.post('/api/chat', handleChat);
}
