import type { NextFunction, Request, Response } from 'express';

import { logger } from '../logger/logger.js';
import { AppError } from './app-error.js';

export const errorHandler = (
  error: Error,
  request: Request,
  response: Response,
  _next: NextFunction,
) => {
  const appError = error instanceof AppError ? error : new AppError('Unexpected error');

  logger.error(
    {
      err: error,
      path: request.path,
      method: request.method,
      code: appError.code,
    },
    appError.message,
  );

  response.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details ?? null,
    },
  });
};

