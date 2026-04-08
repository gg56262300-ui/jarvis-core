import type { NextFunction, Request, Response } from 'express';

import { logger } from './logger.js';

export const httpLogger = (request: Request, response: Response, next: NextFunction) => {
  const startedAt = Date.now();

  response.on('finish', () => {
    logger.info(
      {
        method: request.method,
        url: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'HTTP request completed',
    );
  });

  next();
};
