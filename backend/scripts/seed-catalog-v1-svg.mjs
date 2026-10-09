// Sinh 105 SVG placeholder cho V1 products de UI khong bi 404.
// Chung phong cach voi V2 placeholder nhung khac text.

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSeedDataset } from '../src/seed/generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'frontend', 'public', 'images', 'products');

const CATEGORY_BG = {
  CAT_001: '#1d4ed8',
  CAT_002: '#059669',
  CAT_003: '#db2777',
  CAT_004: '#7c3aed',
  CAT_005: '#ea580c',
  CAT_006: '#0891b2',
};

const CATEGORY_LABEL = {
  CAT_001: 'Laptop',
  CAT_002: 'Dien thoai',
  CAT_003: 'Am thanh',
  CAT_004: 'Phu kien',
  CAT_005: 'Dong ho',
  CAT_006: 'Tablet',
};

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSvg(p) {
  const bg = CATEGORY_BG[p.categoryId] || '#475569';
  const label = CATEGORY_LABEL[p.categoryId] || '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="${escape(p.name)}">
  <defs>
    <linearGradient id="bg-${p.productId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg-${p.productId})"/>
  <rect x="40" y="40" width="520" height="520" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2" rx="24"/>
  <text x="300" y="120" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="20" fill="#ffffff" fill-opacity="0.7">${escape(label)}</text>
  <text x="300" y="190" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="34" font-weight="700" fill="#ffffff">DT13</text>
  <foreignObject x="60" y="220" width="480" height="240">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #ffffff; font-size: 28px; line-height: 1.3; text-align: center; padding: 0 24px; box-sizing: border-box; height: 100%; display: flex; align-items: center; justify-content: center;">${escape(p.name)}</div>
  </foreignObject>
  <text x="300" y="510" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22" fill="#ffffff" fill-opacity="0.9">${escape(p.productId)}</text>
  <text x="300" y="540" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" fill="#ffffff" fill-opacity="0.55">V1 - placeholder</text>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
const dataset = generateSeedDataset();
let count = 0;
for (const p of dataset.products) {
  const filename = `${p.productId.toLowerCase()}.svg`;
  const file = path.join(OUT_DIR, filename);
  writeFileSync(file, buildSvg(p), { encoding: 'utf8' });
  count += 1;
}
console.log(`[seed-v1-svg] wrote ${count} V1 placeholder SVGs`);
