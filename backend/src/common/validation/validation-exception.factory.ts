import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Flat, frontend-friendly validation error payload: one message per field.
 *
 * @example { "email": "Please provide a valid email address" }
 */
export interface FlatValidationErrors {
  [field: string]: string;
}

/**
 * Recursively flattens class-validator errors into a `{ field: message }` map,
 * keeping the first constraint message for each field. Nested fields are joined
 * with dot notation (e.g. `address.zip`).
 */
function flatten(
  errors: ValidationError[],
  parentPath = '',
  acc: FlatValidationErrors = {},
): FlatValidationErrors {
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      const messages = Object.values(error.constraints);
      if (messages.length > 0 && !(path in acc)) {
        acc[path] = messages[0];
      }
    }

    if (error.children && error.children.length > 0) {
      flatten(error.children, path, acc);
    }
  }

  return acc;
}

/**
 * `exceptionFactory` for the global `ValidationPipe`. Replaces NestJS' default
 * array-of-strings response with a flat `{ field: message }` object so the
 * frontend can map errors straight onto form fields.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    errors: flatten(errors),
  });
}
