import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const base = new URL('./', import.meta.url);
const bytes = await readFile(new URL('catalog-reference.json', base));
const d = JSON.parse(bytes.toString('utf8'));
const integrity = JSON.parse(await readFile(new URL('integrity.json', base), 'utf8'));
const oracle = JSON.parse(await readFile(new URL('reference-oracle.json', base), 'utf8'));
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function unique(rows, key) { return new Set(rows.map(r => r[key])).size === rows.length; }
function normalize(text) {
  return text.toLowerCase().replaceAll('đ', 'd').replaceAll('+', ' plus ')
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const pids = new Set(d.products.map(p => p.productId));
const cids = new Set(d.customers.map(c => c.customerId));
const catids = new Set(d.categories.map(c => c.categoryId));
const pm = new Map(d.products.map(p => [p.productId, p]));
const active = new Set(d.customers.filter(c => c.active).map(c => c.customerId));
const purchases = new Map(d.customers.map(c => [c.customerId, new Set()]));
const seen = new Map(d.customers.map(c => [c.customerId, []]));
for (const e of d.bought) purchases.get(e.customerId)?.add(e.productId);
for (const e of d.viewed) seen.get(e.customerId)?.push(e.productId);
const isDate = s => typeof s === 'string' && /Z$/.test(s) && Number.isFinite(Date.parse(s));

check('UTF-8, không BOM và checksum khớp', () => {
  assert.ok(!bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])));
  assert.equal(Buffer.from(bytes.toString('utf8'), 'utf8').compare(bytes), 0);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), integrity.sha256);
});
check('120 Product, 60 Customer, 6 Category', () => {
  assert.equal(d.products.length, 120); assert.equal(d.customers.length, 60);
  assert.equal(d.categories.length, 6);
  assert.ok(d.products.length >= 100 && d.customers.length >= 50);
});
check('372 BOUGHT + 360 VIEWED, không tính BELONGS_TO', () => {
  assert.equal(d.bought.length, 372); assert.equal(d.viewed.length, 360);
  assert.ok(d.bought.length + d.viewed.length > 300);
  assert.equal(d.belongsTo.length, 120);
});
check('ID node và email duy nhất', () => {
  assert.ok(unique(d.products, 'productId') && unique(d.customers, 'customerId'));
  assert.ok(unique(d.categories, 'categoryId') && unique(d.customers, 'email'));
  assert.equal(new Set([...pids, ...cids, ...catids]).size, 186);
});
check('120 tên, model và slug khác nhau', () => {
  assert.equal(new Set(d.products.map(p => normalize(p.name))).size, 120);
  assert.ok(unique(d.products, 'catalogKey') && unique(d.products, 'slug'));
  assert.ok(d.products.every(p => p.name === p.brand + ' ' + p.model && !/^product[-_ ]?\d/i.test(p.name)));
});
check('Nguồn hãng và metadata tìm kiếm đầy đủ', () => {
  const sources = new Map(d.sources.map(s => [s.sourceId, s]));
  const domains = ['apple.com', 'dell.com', 'delltechnologies.com', 'hp.com',
    'asus.com', 'lenovo.com', 'samsung.com', 'logitech.com', 'sony.com.vn',
    'sony.com', 'pro.sony', 'jbl.com', 'bose.com', 'sennheiser-hearing.com'];
  for (const p of d.products) {
    const host = new URL(p.sourceUrl).hostname;
    assert.ok(domains.some(x => host === x || host.endsWith('.' + x)));
    assert.equal(sources.get(p.sourceId)?.url, p.sourceUrl);
    assert.equal(p.searchText, normalize(p.name + ' ' + d.categories.find(c => c.categoryId === p.categoryId).name));
  }
});
check('Giá demo nguyên VND, khách giả lập, không chứa mật khẩu', () => {
  assert.ok(d.meta.pricesAreSynthetic && d.meta.customersAreSynthetic && d.meta.behaviorsAreSynthetic);
  assert.ok(d.products.every(p => Number.isSafeInteger(p.price) && p.price > 0 && p.currency === 'VND'));
  assert.ok(d.customers.every(c => c.email.endsWith('@example.test') && c.role === 'customer'));
  assert.ok(d.customers.every(c => !('password' in c) && !('passwordHash' in c) && !('salt' in c)));
});
check('Mỗi sản phẩm đúng một danh mục, mỗi danh mục 20 model', () => {
  assert.ok(unique(d.belongsTo, 'productId'));
  const byCat = new Map(d.categories.map(c => [c.categoryId, 0]));
  for (const e of d.belongsTo) {
    assert.ok(pids.has(e.productId) && catids.has(e.categoryId));
    assert.equal(pm.get(e.productId).categoryId, e.categoryId);
    byCat.set(e.categoryId, byCat.get(e.categoryId) + 1);
  }
  assert.ok([...byCat.values()].every(n => n === 20));
});
check('EventId duy nhất; mọi cạnh có node đầu cuối', () => {
  const all = [...d.bought, ...d.viewed];
  assert.ok(unique(all, 'eventId'));
  assert.ok(all.every(e => cids.has(e.customerId) && pids.has(e.productId)));
});
check('Timestamp hợp lệ; quantity và unitPrice đúng snapshot demo', () => {
  assert.ok(d.products.every(p => isDate(p.createdAt)));
  assert.ok(d.customers.every(c => isDate(c.createdAt)));
  assert.ok(d.bought.every(e => isDate(e.purchasedAt) && e.purchasedAt <= '2026-10-08T00:00:00Z'
    && Number.isSafeInteger(e.quantity) && e.quantity > 0 && e.unitPrice === pm.get(e.productId).price));
  assert.ok(d.viewed.every(e => isDate(e.viewedAt) && e.viewedAt <= '2026-10-08T00:00:00Z'));
});
check('58 khách active, 2 inactive không có hành vi', () => {
  assert.equal(active.size, 58);
  assert.ok([...d.bought, ...d.viewed].every(e => active.has(e.customerId)));
  assert.ok(d.customers.filter(c => !c.active).every(c =>
    purchases.get(c.customerId).size === 0 && seen.get(c.customerId).length === 0));
});
check('56 người mua, 2 khách mới chỉ xem; giỏ hàng đa danh mục', () => {
  const buyers = [...purchases].filter(([, s]) => s.size);
  assert.equal(buyers.length, 56);
  assert.equal([...active].filter(c => purchases.get(c).size === 0 && seen.get(c).length > 0).length, 2);
  assert.ok(buyers.every(([, s]) => new Set([...s].map(p => pm.get(p).categoryId)).size >= 2));
  assert.ok(new Set(buyers.map(([, s]) => s.size)).size >= 4);
});
check('360 cặp mua phân biệt, 12 sự kiện mua lặp', () => {
  const pairs = new Set(d.bought.map(e => e.customerId + ':' + e.productId));
  assert.equal(pairs.size, 360); assert.equal(d.bought.length - pairs.size, 12);
});
check('118 model có người mua, 120 model có lượt xem', () => {
  assert.equal(new Set(d.bought.map(e => e.productId)).size, 118);
  assert.equal(new Set(d.viewed.map(e => e.productId)).size, 120);
  assert.ok(!d.bought.some(e => ['RC_P059', 'RC_P120'].includes(e.productId)));
});

function recommend(cid, sets = purchases) {
  const totals = new Map();
  for (const peer of [...active].sort()) {
    if (peer === cid) continue;
    const shared = [...sets.get(cid)].filter(p => sets.get(peer).has(p)).length;
    if (!shared) continue;
    for (const pid of sets.get(peer)) {
      if (sets.get(cid).has(pid) || !pm.get(pid).active) continue;
      const old = totals.get(pid) ?? { productId: pid, score: 0, support: 0 };
      old.score += shared; old.support += 1; totals.set(pid, old);
    }
  }
  return [...totals.values()].sort((a,b) => b.score-a.score || b.support-a.support ||
    a.productId.localeCompare(b.productId)).slice(0,10);
}
function coBought(cid, source) {
  const totals = new Map();
  for (const peer of active) {
    if (!purchases.get(peer).has(source)) continue;
    for (const pid of purchases.get(peer)) {
      if (pid === source || purchases.get(cid).has(pid) || !pm.get(pid).active) continue;
      totals.set(pid, (totals.get(pid) ?? 0) + 1);
    }
  }
  return [...totals].map(([productId,n]) => ({productId, score:n, support:n}))
    .sort((a,b) => b.score-a.score || a.productId.localeCompare(b.productId)).slice(0,10);
}
check('Oracle user_cf khớp toàn bộ 58 khách active', () => {
  for (const cid of active) assert.deepEqual(recommend(cid), oracle.userCF[cid]);
});
check('Oracle co_bought khớp 3 trường hợp nguồn', () => {
  for (const c of oracle.coBought) assert.deepEqual(coBought(c.customerId, c.sourceProductId), c.items);
});
check('Bỏ 12 lần mua lặp không thay đổi điểm gợi ý', () => {
  const dedup = new Map(d.customers.map(c => [c.customerId, new Set()]));
  const used = new Set();
  for (const e of d.bought) {
    const key = e.customerId + ':' + e.productId;
    if (!used.has(key)) { used.add(key); dedup.get(e.customerId).add(e.productId); }
  }
  for (const cid of active) assert.deepEqual(recommend(cid), recommend(cid, dedup));
});
check('Khách lạnh và sản phẩm chưa có người mua trả rỗng theo công thức hiện tại', () => {
  assert.deepEqual(recommend('RC_C057'), []); assert.deepEqual(recommend('RC_C058'), []);
  assert.deepEqual(coBought('RC_C001','RC_P120'), []);
});
check('Có ứng viên gợi ý qua khách ở nhóm khác', () => {
  const cohorts = new Map(d.customers.map(c => [c.customerId,c.cohort]));
  const own = purchases.get('RC_C001');
  assert.ok([...active].some(peer => cohorts.get(peer) !== cohorts.get('RC_C001') &&
    [...purchases.get(peer)].some(p => own.has(p)) &&
    [...purchases.get(peer)].some(p => !own.has(p))));
});
check('Đồ thị mua có một thành phần khách hàng liên thông', () => {
  const pending = ['RC_C001'], reached = new Set(pending);
  while (pending.length) {
    const a = pending.shift();
    for (const [b, set] of purchases) {
      if (reached.has(b) || ![...purchases.get(a)].some(p => set.has(p))) continue;
      reached.add(b); pending.push(b);
    }
  }
  assert.equal(reached.size, 56);
});
console.log(JSON.stringify({
  status:'OFFLINE_DATASET_PASS', checks:checks.length, details:checks,
  counts:d.meta.expected, databaseStatus:'NOT_RUN',
  input:fileURLToPath(new URL('catalog-reference.json',base))
}, null, 2));
