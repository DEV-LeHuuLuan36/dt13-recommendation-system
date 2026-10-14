/**
 * Password hashing with node:crypto scrypt.
 * Hash format: scrypt$N$r$p$saltB64$hashB64 (N/r/p are scrypt cost parameters).
 * Each password gets a fresh random salt; comparison uses timingSafeEqual.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export const SCRYPT_N = 16384; // 2^14
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SALT_BYTES = 16;
export const HASH_BYTES = 64;
export const SCRYPT_PREFIX = 'scrypt';

export function isValidPassword(plain) {
  return typeof plain === 'string' && plain.length >= 1 && plain.length <= 256;
}

export async function hashPassword(plain, { salt: customSalt } = {}) {
  if (!isValidPassword(plain)) {
    throw new Error('Invalid password');
  }
  const salt = customSalt
    ? (Buffer.isBuffer(customSalt) ? customSalt : Buffer.from(customSalt))
    : randomBytes(SALT_BYTES);
  const derived = await scrypt(plain, salt, HASH_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `${SCRYPT_PREFIX}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

// Returns false (instead of throwing) for malformed hashes so callers can treat all auth failures uniformly.
export async function verifyPassword(plain, stored) {
  if (!isValidPassword(plain) || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return false;
  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  const saltB64 = parts[4];
  const hashB64 = parts[5];
  if (![N, r, p].every(Number.isFinite) || N <= 0 || r <= 0 || p <= 0) return false;
  let saltBuf;
  let expectedBuf;
  try {
    saltBuf = Buffer.from(saltB64, 'base64');
    expectedBuf = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (expectedBuf.length === 0) return false;
  let actualBuf;
  try {
    actualBuf = await scrypt(plain, saltBuf, expectedBuf.length, { N, r, p });
  } catch {
    return false;
  }
  if (actualBuf.length !== expectedBuf.length) return false;
  try {
    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}
