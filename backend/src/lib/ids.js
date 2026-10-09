import { randomUUID } from 'node:crypto';

/**
 * Sinh ID khong va cham cho Product/Category/Customer. Dinh dang: PREFIX + uuid (khong dau gach ngang).
 * Dam bao bat dau bang chu cai va chi chua ky tu ID_REGEX ([A-Za-z0-9_-]).
 */
export function generateId(prefix) {
  if (typeof prefix !== 'string' || !/^[A-Z][A-Z0-9_]{0,8}$/.test(prefix)) {
    throw new Error(`Prefix ID khong hop le: ${prefix}`);
  }
  const uuid = randomUUID().replace(/-/g, '');
  return `${prefix}_${uuid}`;
}

export const PREFIX = {
  product: 'PROD',
  customer: 'CUST',
  category: 'CAT',
};
