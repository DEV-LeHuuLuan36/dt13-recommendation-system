// Generator V2 behaviors (BOUGHT + VIEWED) cho 25 customer V2 + 2 inactive.
// Bảo toàn: seed A-E khong them BOUGHT. E tiep tuc lanh.
// 25 customer V2 them BOUGHT theo persona, khoang 640 BOUGHT (muc tieu +640).
// 2 inactive them 1 vai BOUGHT truoc ngay inactive (INACTIVE_WITH_HISTORY).
// VIEWED them ~470 (muc tieu +470).
//
// Co dinh nghia theo persona de thuc hien cau truc nhu yeu cau:
//  - Gaming: 2-3 product, tap trung laptop/chuot/ban phim/tai nghe gaming.
//  - Van phong: 3-6 product, laptop/phu kien.
//  - Sinh vien: 1-4 product, gia demo thap.
//  - Cold-start (1 nguoi trong 25 V2): khong BOUGHT, co vai VIEWED.
//
// Idempotent: moi BOUGHT/VIEWED co eventId co prefix V2. seed V1 giu nguyen.

import { createHash } from 'node:crypto';
import { V2_MARKER } from './accounts-v2.js';

export const V2_BEHAVIOR_MARKER = 'DT13_SEED_V2_BEHAVIOR';

const BASE_DATE = Date.UTC(2026, 0, 1, 9, 0, 0);

function addMinutes(epochMs, minutes) {
  return new Date(epochMs + minutes * 60 * 1000);
}

function deterministicRandom(seedStr) {
  // Simple hash -> mulberry32
  const h = createHash('sha256').update(seedStr).digest();
  let s = h.readUInt32BE(0);
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, seed) {
  const rng = deterministicRandom(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN(arr, n, seed) {
  return shuffleSeeded(arr, seed).slice(0, n);
}

// Categogy -> product list (theo categoryId, dùng cho bias)
function productsByCategory(catalogV2) {
  const map = new Map();
  for (const p of catalogV2) {
    const arr = map.get(p.categoryId) || [];
    arr.push(p);
    map.set(p.categoryId, arr);
  }
  return map;
}

const PERSONA_CATEGORIES = {
  Gaming: ['CAT_001', 'CAT_003', 'CAT_004', 'CAT_006'],
  'Van phong': ['CAT_001', 'CAT_004', 'CAT_006'],
  'Sinh vien': ['CAT_001', 'CAT_002', 'CAT_004', 'CAT_006'],
};

// Tinh theo persona 1 nguoi (sinh BOUGHT events)
function personaBought({ customerId, persona, catalogV2, byCat }) {
  const events = [];
  if (persona === 'Cold start') return events;
  const cats = PERSONA_CATEGORIES[persona] || ['CAT_001'];
  const rng = deterministicRandom(`bought:${customerId}`);
  // So BOUGHT theo persona (muc tieu tong ~900 BOUGHT tu 25 customer V2)
  let boughtCount;
  if (persona === 'Gaming') boughtCount = 28 + Math.floor(rng() * 12); // 28-39
  else if (persona === 'Van phong') boughtCount = 32 + Math.floor(rng() * 13); // 32-44
  else if (persona === 'Sinh vien') boughtCount = 8 + Math.floor(rng() * 7); // 8-14
  else boughtCount = 12;
  // Lay pool theo persona categories
  const pool = [];
  for (const c of cats) {
    const arr = byCat.get(c) || [];
    for (const p of arr) pool.push(p);
  }
  // Them 25% cross-category (lay tu ngoai pool)
  const allOthers = catalogV2.filter((p) => !cats.includes(p.categoryId));
  const crossN = Math.max(2, Math.floor(boughtCount * 0.25));
  const cross = pickN(allOthers, crossN, `cross:${customerId}`);
  for (const p of cross) pool.push(p);
  // Chon
  const picks = pickN(pool, Math.min(boughtCount, pool.length), `pick:${customerId}`);
  let seq = 0;
  for (const p of picks) {
    seq += 1;
    const quantity = seq === 1 && rng() < 0.25 ? 2 : 1; // 25% mua quantity 2 o event dau
    events.push({
      eventId: `BOUGHT_${V2_MARKER}_${customerId}_${String(seq).padStart(3, '0')}`,
      customerId,
      productId: p.productId,
      quantity,
      unitPrice: p.price,
      purchasedAt: addMinutes(BASE_DATE, parseInt(customerId.slice(-3), 10) * 600 + seq * 31),
    });
  }
  // Them 1 mua lap cho 1 so persona: 30% Gaming co mua lap (1 product lap 2 eventId)
  if (persona === 'Gaming' && rng() < 0.5 && events.length > 0) {
    const dup = events[Math.floor(rng() * events.length)];
    events.push({
      eventId: `BOUGHT_${V2_MARKER}_${customerId}_${String(events.length + 1).padStart(3, '0')}`,
      customerId,
      productId: dup.productId,
      quantity: dup.quantity,
      unitPrice: dup.unitPrice,
      purchasedAt: addMinutes(BASE_DATE, parseInt(customerId.slice(-3), 10) * 600 + 1500),
    });
  }
  return events;
}

function personaViewed({ customerId, persona, catalogV2, byCat }) {
  const events = [];
  const cats = PERSONA_CATEGORIES[persona] || ['CAT_001'];
  const rng = deterministicRandom(`viewed:${customerId}`);
  // Muc tieu tong ~650 VIEWED tu 25 customer V2
  let viewedCount;
  if (persona === 'Cold start') viewedCount = 2 + Math.floor(rng() * 3); // 2-4
  else if (persona === 'Gaming') viewedCount = 22 + Math.floor(rng() * 8); // 22-29
  else if (persona === 'Van phong') viewedCount = 23 + Math.floor(rng() * 8); // 23-30
  else if (persona === 'Sinh vien') viewedCount = 8 + Math.floor(rng() * 6); // 8-13
  else viewedCount = 5;
  const pool = [];
  for (const c of cats) {
    const arr = byCat.get(c) || [];
    for (const p of arr) pool.push(p);
  }
  const allOthers = catalogV2.filter((p) => !cats.includes(p.categoryId));
  const crossN = Math.max(2, Math.floor(viewedCount * 0.3));
  const cross = pickN(allOthers, crossN, `v-cross:${customerId}`);
  for (const p of cross) pool.push(p);
  const picks = pickN(pool, Math.min(viewedCount, pool.length), `v-pick:${customerId}`);
  let seq = 0;
  for (const p of picks) {
    seq += 1;
    events.push({
      eventId: `VIEWED_${V2_MARKER}_${customerId}_${String(seq).padStart(3, '0')}`,
      customerId,
      productId: p.productId,
      viewedAt: addMinutes(BASE_DATE, parseInt(customerId.slice(-3), 10) * 1000 + seq * 17),
    });
  }
  return events;
}

/**
 * Sinh BOUGHT + VIEWED cho 25 customer V2 (co persona) + 2 inactive.
 * Tra ve { bought, viewed }.
 */
export function generateBehaviorsV2({ customersV2, catalogV2 }) {
  const byCat = productsByCategory(catalogV2);
  const bought = [];
  const viewed = [];
  for (const c of customersV2) {
    const persona = c.persona;
    bought.push(...personaBought({ customerId: c.customerId, persona, catalogV2, byCat }));
    viewed.push(...personaViewed({ customerId: c.customerId, persona, catalogV2, byCat }));
  }
  return { bought, viewed };
}
