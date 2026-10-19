// Utilities for Vietnamese text processing, search normalization, and keyword extraction.

const ACCENT_MAP = {
  a: /[àáạảãâầấậẩẫăằắặẳẵ]/g,
  e: /[èéẹẻẽêềếệểễ]/g,
  i: /[ìíịỉĩ]/g,
  o: /[òóọỏõôồốộổỗơờớợởỡ]/g,
  u: /[ùúụủũưừứựửữ]/g,
  y: /[ỳýỵỷỹ]/g,
  d: /[đ]/g,
  A: /[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g,
  E: /[ÈÉẸẺẼÊỀẾỆỂỄ]/g,
  I: /[ÌÍỊỈĨ]/g,
  O: /[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g,
  U: /[ÙÚỤỦŨƯỪỨỰỬỮ]/g,
  Y: /[ỲÝỴỶỸ]/g,
  D: /[Đ]/g,
};

/**
 * Removes Vietnamese accents/diacritics from a string.
 */
export function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  let result = str;
  for (const [plain, regex] of Object.entries(ACCENT_MAP)) {
    result = result.replace(regex, plain);
  }
  // Normalize decomposing characters
  return result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizes user search input:
 * - strips control characters and special query chars
 * - removes diacritics
 * - lowercases and collapses multiple whitespaces
 * - limits length to maxLen (default 100)
 */
export function normalizeSearchQuery(query, maxLen = 100) {
  if (!query || typeof query !== 'string') return '';
  const cleaned = query
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/["'`;\\/]/g, ' ')
    .trim()
    .slice(0, maxLen);
  const withoutTones = removeVietnameseTones(cleaned).toLowerCase();
  return withoutTones.replace(/\s+/g, ' ').trim();
}

/**
 * Splits normalized string into tokens with length >= 2.
 */
export function tokenize(str) {
  const norm = normalizeSearchQuery(str);
  if (!norm) return [];
  return norm.split(' ').filter((t) => t.length >= 2);
}
