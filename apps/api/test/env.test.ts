import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const base = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/takip',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  MCP_SECRET: 'c'.repeat(32),
};

describe('loadEnv', () => {
  it('geçerli ortamı varsayılanlarla ayrıştırır', () => {
    const env = loadEnv({ ...base, EXPO_ACCESS_TOKEN: '' });
    expect(env.PORT).toBe(3000);
    expect(env.APP_TIMEZONE).toBe('Europe/Istanbul');
    expect(env.EXPO_ACCESS_TOKEN).toBeUndefined();
  });
  it('kısa veya url-safe olmayan MCP_SECRET reddedilir', () => {
    expect(() => loadEnv({ ...base, MCP_SECRET: 'short' })).toThrow(/MCP_SECRET/);
    expect(() => loadEnv({ ...base, MCP_SECRET: 'a+/'.repeat(12) })).toThrow(/url-safe/);
  });
  it('eksik MONGODB_URI reddedilir', () => {
    const { MONGODB_URI: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/MONGODB_URI/);
  });
});
