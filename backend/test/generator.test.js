import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSeedDataset,
  validateSeedDataset,
  PRODUCT_COUNT,
  CUSTOMER_COUNT,
  CATEGORY_COUNT,
  DATASET_MARKER,
} from '../src/seed/generator.js';

test('generateSeedDataset tra ve marker DT13_SEED_V1', () => {
  const ds = generateSeedDataset();
  assert.equal(ds.marker, DATASET_MARKER);
});

test('generateSeedDataset dat dung so luong', () => {
  const ds = generateSeedDataset();
  assert.equal(ds.products.length, PRODUCT_COUNT);
  assert.equal(ds.customers.length, CUSTOMER_COUNT + 1); // +1 admin
  assert.equal(ds.categories.length, CATEGORY_COUNT);
  assert.equal(ds.bought.length, 260);
  assert.equal(ds.viewed.length, 180);
});

test('validateSeedDataset OK voi dataset moi', () => {
  const ds = generateSeedDataset();
  const v = validateSeedDataset(ds);
  assert.equal(v.ok, true, v.errors.join('; '));
});

test('generateSeedDataset deterministic - khong random', () => {
  const a = generateSeedDataset();
  const b = generateSeedDataset();
  // Khong co ngau nhien -> tat ca eventId, productId, customerId giong nhau
  assert.deepEqual(
    a.bought.map((e) => e.eventId),
    b.bought.map((e) => e.eventId)
  );
});

test('bought co 259 cap phan biet (khach, sp) product', () => {
  const ds = generateSeedDataset();
  const pairs = new Set();
  for (const e of ds.bought) pairs.add(`${e.customerId}|${e.productId}`);
  assert.equal(pairs.size, 259);
});

test('CUST_001..CUST_004 chi mua PROD_001..PROD_004', () => {
  const ds = generateSeedDataset();
  const allowed = new Set(['PROD_001', 'PROD_002', 'PROD_003', 'PROD_004']);
  for (const e of ds.bought) {
    if (['CUST_001', 'CUST_002', 'CUST_003', 'CUST_004'].includes(e.customerId)) {
      assert.ok(allowed.has(e.productId), `${e.customerId} mua ${e.productId}`);
    }
  }
});

test('CUST_005 khong co BOUGHT', () => {
  const ds = generateSeedDataset();
  for (const e of ds.bought) {
    assert.notEqual(e.customerId, 'CUST_005');
  }
});

test('CUST_006..CUST_055 khong mua PROD_001..PROD_004', () => {
  const ds = generateSeedDataset();
  const allowed = new Set(['PROD_001', 'PROD_002', 'PROD_003', 'PROD_004']);
  for (const e of ds.bought) {
    const n = Number.parseInt(e.customerId.slice(-3), 10);
    if (n >= 6 && n <= 55) {
      assert.ok(!allowed.has(e.productId), `${e.customerId} mua ${e.productId}`);
    }
  }
});

test('B (CUST_002) co 1 mua lap PROD_003', () => {
  const ds = generateSeedDataset();
  const events = ds.bought.filter((e) => e.customerId === 'CUST_002' && e.productId === 'PROD_003');
  assert.equal(events.length, 2);
  // Hai eventId khac nhau
  assert.notEqual(events[0].eventId, events[1].eventId);
});

test('productIds va customerIds deu unique', () => {
  const ds = generateSeedDataset();
  const productIds = new Set(ds.products.map((p) => p.productId));
  assert.equal(productIds.size, ds.products.length);
  const customerIds = new Set(ds.customers.map((c) => c.customerId));
  assert.equal(customerIds.size, ds.customers.length);
});

test('moi product co 1 categoryId thuoc 6 category', () => {
  const ds = generateSeedDataset();
  const cats = new Set(ds.categories.map((c) => c.categoryId));
  for (const p of ds.products) {
    assert.ok(cats.has(p.categoryId));
  }
});

test('tai san email admin la admin@example.test va role=admin', () => {
  const ds = generateSeedDataset();
  const admin = ds.customers.find((c) => c.customerId === 'ADMIN_001');
  assert.ok(admin);
  assert.equal(admin.email, 'admin@example.test');
  assert.equal(admin.role, 'admin');
});

test('email khach customer theo cust002@example.test ...', () => {
  const ds = generateSeedDataset();
  const c1 = ds.customers.find((c) => c.customerId === 'CUST_001');
  assert.equal(c1.email, 'cust001@example.test');
  const c55 = ds.customers.find((c) => c.customerId === 'CUST_055');
  assert.equal(c55.email, 'cust055@example.test');
});

test('validateSeedDataset phat hien dataset sai (them 1 bought khong hop le)', () => {
  const ds = generateSeedDataset();
  ds.bought.push({ eventId: 'BAD', customerId: 'CUST_001', productId: 'PROD_999', quantity: 1, unitPrice: 1, purchasedAt: new Date() });
  const v = validateSeedDataset(ds);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('khong ton tai') || e.includes('khong cho phep')));
});

test('bought eventId unique', () => {
  const ds = generateSeedDataset();
  const ids = new Set(ds.bought.map((e) => e.eventId));
  assert.equal(ids.size, ds.bought.length);
});

test('viewed eventId unique', () => {
  const ds = generateSeedDataset();
  const ids = new Set(ds.viewed.map((e) => e.eventId));
  assert.equal(ids.size, ds.viewed.length);
});