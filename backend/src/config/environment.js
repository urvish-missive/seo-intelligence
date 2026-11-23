// backend/src/config/environment.js
// Validates all required environment variables at startup.
// Server refuses to start if critical vars are missing.

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_USERNAME: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().default('false').transform(v => v === 'true'),
  REDIS_URL: z.string().optional(),

  // CORS Origins (comma-separated or single)
  CORS_ORIGINS: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3001/api/v1/integrations/google/callback'),

  // Ollama
  OLLAMA_BASE_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:7b'),
  OLLAMA_TIMEOUT_MS: z.string().default('120000').transform(Number),
  OLLAMA_MAX_CONTEXT_TOKENS: z.string().default('8000').transform(Number),

  // MCP
  MCP_SECRET: z.string().optional(),
  MCP_WORKSPACE_ID: z.string().optional(),

  // Sync
  DEFAULT_SYNC_INTERVAL_MINUTES: z.string().default('360').transform(Number),
  MAX_SYNC_RETRIES: z.string().default('3').transform(Number),
  SYNC_RETRY_DELAY_MS: z.string().default('5000').transform(Number),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  AUTH_RATE_LIMIT_MAX: z.string().default('5').transform(Number),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_SQL: z.string().default('false').transform(v => v === 'true'),

  // Reports & File Storage
  REPORTS_DIR: z.string().default('./storage/reports'),
  FILE_STORAGE_PATH: z.string().default('./storage/reports'),
});

function loadEnvironment() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment configuration error:');
    result.error.issues.forEach(issue => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\nCopy .env.example to .env and fill in all required values.');
    process.exit(1);
  }

  return result.data;
}

// Singleton — only validate once
export const env = loadEnvironment();
export default env;
