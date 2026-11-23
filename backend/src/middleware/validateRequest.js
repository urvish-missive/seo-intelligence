// backend/src/middleware/validateRequest.js
// Zod validation middleware for request body, params, and query.

import { ValidationError } from './errorHandler.js';

/**
 * Validate req.body against a Zod schema.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new ValidationError(errors));
    }
    req.body = result.data; // Replace with parsed/coerced values
    next();
  };
}

/**
 * Validate req.query against a Zod schema.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new ValidationError(errors));
    }
    req.query = result.data;
    next();
  };
}

/**
 * Validate req.params against a Zod schema.
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const errors = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new ValidationError(errors));
    }
    req.params = result.data;
    next();
  };
}
