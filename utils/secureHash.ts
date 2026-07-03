import { sha256 } from 'js-sha256';

const HASH_KEY = 'fleet_pro_secret_salt_2024';

export function hashApiKey(apiKey: string): string {
  const combined = `${apiKey}_${HASH_KEY}`;
  return sha256(combined);
}

export function verifyApiKey(apiKey: string, hashed: string): boolean {
  return hashApiKey(apiKey) === hashed;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '*'.repeat(apiKey.length);
  }
  const visibleStart = apiKey.slice(0, 4);
  const visibleEnd = apiKey.slice(-4);
  const masked = '*'.repeat(Math.min(apiKey.length - 8, 8));
  return `${visibleStart}${masked}${visibleEnd}`;
}

export function isValidApiKeyFormat(apiKey: string): boolean {
  return apiKey.length >= 10 && apiKey.length <= 200;
}
