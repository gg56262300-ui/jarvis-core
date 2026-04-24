import { buildApp } from './app.js';
import { env } from './config/index.js';
import { startTelegramLongPollingIfEnabled } from './integrations/telegram/telegram-poller.js';
import { logger } from './shared/logger/logger.js';

const app = buildApp();

app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
    },
    'Jarvis backend listening',
  );
  void startTelegramLongPollingIfEnabled();
});

