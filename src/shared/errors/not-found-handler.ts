import type { NextFunction, Request, Response } from 'express';

import { AppError } from './app-error.js';

export const notFoundHandler = (request: Request, _response: Response, next: NextFunction) => {
  next(new AppError(`Route not found: ${request.method} ${request.path}`, 404, 'ROUTE_NOT_FOUND'));
};

