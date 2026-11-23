// backend/src/middleware/errorHandler.js
// Centralised error handler — never leaks stack traces in production.

import logger from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 400, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

export class UnauthorisedError extends AppError {
  constructor(message = 'Unauthorised') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(errors) {
    super('Validation failed', 422, errors);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Log all errors
  if (err.isOperational) {
    logger.warn(`[${err.statusCode}] ${err.message}`, { path: req.path, method: req.method });
  } else {
    logger.error('Unexpected error:', { error: err.message, stack: err.stack, path: req.path });
  }

  // Prisma-specific errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with these details already exists',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }

  // Zod validation schema errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.errors
        ? err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          }))
        : err.issues,
    });
  }

  // Operational errors (thrown by us)
  if (err.isOperational) {
    const body = { success: false, message: err.message };
    if (err.errors) body.errors = err.errors;
    return res.status(err.statusCode).json(body);
  }

  // Unknown errors — never expose internals in production
  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    ...(isProduction ? {} : { detail: err.message }),
  });
}
