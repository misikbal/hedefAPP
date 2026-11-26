import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  MONGODB_URI: z.string().startsWith('mongodb', 'MONGODB_URI bir mongodb:// adresi olmalı'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  MCP_SECRET: z
    .string()
    .min(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'MCP_SECRET url-safe olmalı (A-Z a-z 0-9 _ -)'),
  APP_TIMEZONE: z.string().default('Europe/Istanbul'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Virgülle ayrılmış izinli tarayıcı kökenleri (mobil uygulama CORS'a ihtiyaç duymaz). */
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : [],
    ),
  /** Coolify/Traefik arkasında gerçek istemci IP'si için X-Forwarded-For'a güvenilir. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** IP başına dakikadaki istek sınırı (giriş uçları ayrıca daha sıkı) */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  /** Strava entegrasyonu (isteğe bağlı; üçü de yoksa entegrasyon kapalı görünür) */
  STRAVA_CLIENT_ID: z.string().regex(/^\d+$/, 'STRAVA_CLIENT_ID sayı olmalı').optional(),
  STRAVA_CLIENT_SECRET: z.string().min(1).optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
  /** Dışarıdan erişilen kök adres (ör. https://hedef.kodmis.com); OAuth callback ve webhook buradan kurulur */
  PUBLIC_API_URL: z
    .url()
    .optional()
    .transform((v) => v?.replace(/\/+$/, '')),
});

export type Env = z.infer<typeof envSchema>;

/** Boş string'leri tanımsız kabul eder (.env'de `KEY=` satırları için). */
function normalize(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ''),
  );
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(normalize(source));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Geçersiz ortam değişkenleri:\n${issues}`);
  }
  return parsed.data;
}
