// Sinh 150 SVG placeholder cho tung product trong catalog V2.
// Moi SVG co ten theo businessId-slug, chua ten product, brand, ID.
// Day la PLACEHOLDER: anh that cua model se duoc cap nhat sau (BLOCKED_ASSETS).

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCatalogV2 } from '../src/seed/catalog-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'frontend', 'public', 'images', 'products');

const CATEGORY_BG = {
  CAT_001: '#1d4ed8', // Laptop - xanh duong
  CAT_002: '#059669', // Dien thoai - xanh la
  CAT_003: '#db2777', // Am thanh - hong
  CAT_004: '#7c3aed', // Phu kien - tim
  CAT_005: '#ea580c', // Dong ho thong minh - cam
  CAT_006: '#0891b2', // May tinh vi - cyan
};

const CATEGORY_LABEL = {
  CAT_001: 'Laptop',
  CAT_002: 'Dien thoai',
  CAT_003: 'Am thanh',
  CAT_004: 'Phu kien',
  CAT_005: 'Dong ho',
  CAT_006: 'Tablet',
};

function brandOf(name) {
  const tokens = name.split(' ');
  if (tokens[0] === 'Apple') return 'Apple';
  if (tokens[0] === 'Microsoft') return 'Microsoft';
  if (tokens[0] === 'Samsung') return 'Samsung';
  if (tokens[0] === 'Sony') return 'Sony';
  if (tokens[0] === 'Xiaomi') return 'Xiaomi';
  if (tokens[0] === 'Dell') return 'Dell';
  if (tokens[0] === 'HP') return 'HP';
  if (tokens[0] === 'Lenovo') return 'Lenovo';
  if (tokens[0] === 'Asus') return 'Asus';
  if (tokens[0] === 'Acer') return 'Acer';
  if (tokens[0] === 'MSI') return 'MSI';
  if (tokens[0] === 'Razer') return 'Razer';
  if (tokens[0] === 'Logitech') return 'Logitech';
  if (tokens[0] === 'JBL') return 'JBL';
  if (tokens[0] === 'Bose') return 'Bose';
  if (tokens[0] === 'Sennheiser') return 'Sennheiser';
  if (tokens[0] === 'Google') return 'Google';
  if (tokens[0] === 'LG') return 'LG';
  if (tokens[0] === 'Huawei') return 'Huawei';
  if (tokens[0] === 'Oppo') return 'Oppo';
  if (tokens[0] === 'Vivo') return 'Vivo';
  if (tokens[0] === 'Realme') return 'Realme';
  if (tokens[0] === 'Nothing') return 'Nothing';
  if (tokens[0] === 'Nokia') return 'Nokia';
  if (tokens[0] === 'Garmin') return 'Garmin';
  if (tokens[0] === 'Fitbit') return 'Fitbit';
  if (tokens[0] === 'Amazfit') return 'Amazfit';
  if (tokens[0] === 'Suunto') return 'Suunto';
  if (tokens[0] === 'Polar') return 'Polar';
  if (tokens[0] === 'Anker') return 'Anker';
  if (tokens[0] === 'Belkin') return 'Belkin';
  if (tokens[0] === 'Elgato') return 'Elgato';
  if (tokens[0] === 'Wacom') return 'Wacom';
  if (tokens[0] === 'Rode') return 'Rode';
  if (tokens[0] === 'HyperX') return 'HyperX';
  if (tokens[0] === 'Bang' && tokens[1] === '&') return 'Bang & Olufsen';
  if (tokens[0] === 'Beats') return 'Beats';
  if (tokens[0] === 'Keychron') return 'Keychron';
  if (tokens[0] === 'Ugreen') return 'Ugreen';
  if (tokens[0] === 'Boox') return 'Boox';
  if (tokens[0] === 'Framework') return 'Framework';
  if (tokens[0] === 'Gigabyte') return 'Gigabyte';
  if (tokens[0] === 'Marshall') return 'Marshall';
  return tokens[0] || 'DT13';
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSvg(p) {
  const bg = CATEGORY_BG[p.categoryId] || '#475569';
  const label = CATEGORY_LABEL[p.categoryId] || '';
  const brand = brandOf(p.name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="${escape(p.name)}">
  <defs>
    <linearGradient id="bg-${p.productId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg-${p.productId})"/>
  <rect x="40" y="40" width="520" height="520" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2" rx="24"/>
  <text x="300" y="120" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="20" fill="#ffffff" fill-opacity="0.7">${escape(label)}</text>
  <text x="300" y="190" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${escape(brand)}</text>
  <foreignObject x="60" y="220" width="480" height="240">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #ffffff; font-size: 28px; line-height: 1.3; text-align: center; padding: 0 24px; box-sizing: border-box; height: 100%; display: flex; align-items: center; justify-content: center;">${escape(p.name)}</div>
  </foreignObject>
  <text x="300" y="510" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22" fill="#ffffff" fill-opacity="0.9">${escape(p.productId)}</text>
  <text x="300" y="540" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" fill="#ffffff" fill-opacity="0.55">placeholder - BLOCKED_ASSETS</text>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
const products = generateCatalogV2();
let count = 0;
for (const p of products) {
  const filename = `${p.productId.toLowerCase()}-${p.slug}.svg`;
  const file = path.join(OUT_DIR, filename);
  writeFileSync(file, buildSvg(p), { encoding: 'utf8' });
  count += 1;
}
console.log(`[catalog-v2-svg] wrote ${count} placeholder SVGs to ${OUT_DIR}`);
