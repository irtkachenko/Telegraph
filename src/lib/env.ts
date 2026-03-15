import { ConfigError } from '@/shared/lib/errors';

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new ConfigError(`Missing required env var: ${key}`);
  }
  return value;
}
