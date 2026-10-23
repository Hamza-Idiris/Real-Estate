import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  FILE_SIGNING_SECRET: z.string().min(32, 'FILE_SIGNING_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  USE_TRANSACTIONS: z.enum(['true', 'false']).default('false'),
  UPLOAD_DIR: z.string().default('uploads'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  VIEWING_SLOT_MINUTES: z.coerce.number().int().min(10).max(240).default(30),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.string().default('info'),
  RUN_JOBS: z.enum(['true', 'false']).default('true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    'Invalid or missing environment variables:\n' +
      parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n') +
      '\nSee .env.example'
  );
  process.exit(1);
}
export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
