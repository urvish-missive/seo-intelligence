// backend/src/utils/logger.js
// Winston logger — structured JSON in production, readable in dev.

import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, colorize, errors, json } = format;

const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}] ${stack || message}${metaStr}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    process.env.NODE_ENV === 'production' ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new transports.Console(),
    ...(process.env.NODE_ENV === 'production'
      ? [
          new transports.File({ filename: 'logs/error.log', level: 'error' }),
          new transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  exitOnError: false,
});

export default logger;
