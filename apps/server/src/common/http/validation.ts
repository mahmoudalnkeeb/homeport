import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import type { ApiErrorDetail } from '@homeport/contracts';
import { Transform } from 'class-transformer';

import { AppError } from './app-error.js';

function flatten(errors: ValidationError[], parent = ''): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export const createValidationPipe = (): ValidationPipe =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_FAILED', 'Invalid request', flatten(errors)),
  });

export const Trim = (): PropertyDecorator => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const TrimLower = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export const QueryBoolean = (): PropertyDecorator =>
  Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));
