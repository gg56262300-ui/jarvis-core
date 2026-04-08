import type { Request } from 'express';
import type { ZodType } from 'zod';

import { AppError } from '../errors/app-error.js';

export const validateRequest = <T>(schema: ZodType<T>, value: unknown, message = 'Invalid request') => {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError(message, 400, 'VALIDATION_ERROR', result.error.flatten());
  }

  return result.data;
};

export const validateRequestBody = <T>(schema: ZodType<T>, request: Request, message?: string) => {
  return validateRequest(schema, request.body, message);
};

export const validateRequestParams = <T>(schema: ZodType<T>, request: Request, message?: string) => {
  return validateRequest(schema, request.params, message);
};
