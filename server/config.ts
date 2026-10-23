import { z } from 'zod';
import { ConfigurationError } from './configError';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ALLOWED_ORIGINS: z.string().default(''),
  NODE_ENV: z.string().default('development'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  LOGIN_IP_MAX_FAILURES: z.coerce.number().int().min(3).max(1000).default(20),
  FILE_STORAGE_DRIVER: z.enum(['database', 'supabase']).optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).default('ekapon-private'),
});

export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  allowedOrigins: string[];
  isProd: boolean;
  sessionHours: number;
  loginIpMaxFailures: number;
  fileStorageDriver: 'database' | 'supabase';
  supabaseUrl: string;
  supabaseSecretKey: string;
  storageBucket: string;
}

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const r = schema.safeParse(process.env);
    if (!r.success) {
      const fields = [...new Set(r.error.issues.map((i) => String(i.path[0])))].sort();
      throw new ConfigurationError(fields, 'Invalid environment: ' + fields.join(', '));
    }
    const e = r.data;
    const fileStorageDriver = e.FILE_STORAGE_DRIVER ?? (e.NODE_ENV === 'production' ? 'supabase' : 'database');
    if (e.NODE_ENV === 'production' && fileStorageDriver !== 'supabase') {
      throw new ConfigurationError(['FILE_STORAGE_DRIVER'], 'Production requires private Supabase file storage.');
    }
    if (fileStorageDriver === 'supabase') {
      let storageUrl: URL;
      try { storageUrl = new URL(e.SUPABASE_URL ?? ''); } catch { throw new ConfigurationError(['SUPABASE_URL'], 'SUPABASE_URL is required for private file storage.'); }
      if (storageUrl.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(storageUrl.hostname) || storageUrl.pathname !== '/' || storageUrl.port || storageUrl.username || storageUrl.password || storageUrl.search || storageUrl.hash) {
        throw new ConfigurationError(['SUPABASE_URL'], 'SUPABASE_URL must be the HTTPS project URL from the Supabase dashboard.');
      }
      if (!e.SUPABASE_SECRET_KEY || e.SUPABASE_SECRET_KEY.length < 32) throw new ConfigurationError(['SUPABASE_SECRET_KEY'], 'A server-only SUPABASE_SECRET_KEY is required for private file storage.');
    }
    cached = {
      databaseUrl: e.DATABASE_URL,
      jwtSecret: e.JWT_SECRET,
      allowedOrigins: e.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
      isProd: e.NODE_ENV === 'production',
      sessionHours: e.SESSION_HOURS,
      loginIpMaxFailures: e.LOGIN_IP_MAX_FAILURES,
      fileStorageDriver,
      supabaseUrl: (e.SUPABASE_URL ?? '').replace(/\/$/, ''),
      supabaseSecretKey: e.SUPABASE_SECRET_KEY ?? '',
      storageBucket: e.SUPABASE_STORAGE_BUCKET,
    };
  }
  return cached;
}
