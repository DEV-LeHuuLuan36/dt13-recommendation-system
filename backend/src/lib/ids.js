import { randomUUID } from 'node:crypto';

// Prefix + uuid (no dashes). The prefix is restricted so generated IDs match the same regex used elsewhere.
export function generateId(prefix) {
  if (typeof prefix !== 'string' || !/^[A-Z][A-Z0-9_]{0,8}$/.test(prefix)) {
    throw new Error(`Invalid ID prefix: ${prefix}`);
  }
  const uuid = randomUUID().replace(/-/g, '');
  return `${prefix}_${uuid}`;
}

export const PREFIX = {
  product: 'PROD',
  customer: 'CUST',
  category: 'CAT',
};
