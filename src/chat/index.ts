import type { Express, Request, Response } from 'express';
import { handleChat } from './chat.controller.js';
import { getChatChannelMessages, postChatChannelMessage, postChatChannelUserMessage } from './channel.controller.js';
import { logger } from '../shared/logger/logger.js';

async function handleChatWithHardFallback(req: Request, res: Response) {
  try {
    await handleChat(req, res);
  } catch (err) {
    logger.error({ err }, 'chat: unhandled error in hard fallback wrapper');
    const raw = String(req.body?.message ?? '').trim();
    const suffix = raw && raw.length <= 80 ? `: "${raw}"` : '';
    res.status(200).json({
      reply: `Sain sõnumi kätte${suffix}. Kanal töötab, kuid AI-kiht andis sisemise vea; proovi uuesti.`,
      degraded: true,
      error: 'INTERNAL_CHAT_ERROR',
    });
  }
}

export function registerChatModule(app: Express) {
  app.post('/api/chat', handleChatWithHardFallback);
  app.get('/api/chat/channel', getChatChannelMessages);
  app.post('/api/chat/channel', postChatChannelMessage);
  app.post('/api/chat/channel/user', postChatChannelUserMessage);
}
