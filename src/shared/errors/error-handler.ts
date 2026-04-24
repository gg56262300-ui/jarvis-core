import type { NextFunction, Request, Response } from 'express';

import { logger } from '../logger/logger.js';
import { AppError } from './app-error.js';

export const errorHandler = (
  error: Error,
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  void next;
  const appError = error instanceof AppError ? error : new AppError('Unexpected error');

  const isNotFound = appError.code === 'ROUTE_NOT_FOUND' || appError.statusCode === 404;
  const noisyProbe =
    isNotFound &&
    /(^|\/)(wp-admin|wordpress|wp-login\.php|xmlrpc\.php)(\/|$)/i.test(request.path || '');

  const log = noisyProbe ? logger.info : logger.error;
  log(
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

