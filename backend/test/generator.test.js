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

test('generateSeedDataset uses the DT13_SEED_V1 marker', () => {
  const ds = generateSeedDataset();
  assert.equal(ds.marker, DATASET_MARKER);
});

test('generateSeedDataset produces the expected counts', () => {
  const ds = generateSeedDataset();
  assert.equal(ds.products.length, PRODUCT_COUNT);
  // +1 row for the admin account.
  assert.equal(ds.customers.length, CUSTOMER_COUNT + 1);
  assert.equal(ds.categories.length, CATEGORY_COUNT);
  assert.equal(ds.bought.length, 260);
  assert.equal(ds.viewed.length, 180);
});

test('validateSeedDataset accepts a freshly generated dataset', () => {
  const ds = generateSeedDataset();
  const v = validateSeedDataset(ds);
  assert.equal(v.ok, true, v.errors.join('; '));
});

test('generateSeedDataset is deterministic (no randomness)', () => {
  const a = generateSeedDataset();
  const b = generateSeedDataset();
  // No randomness -> all eventId/productId/customerId values match.
  assert.deepEqual(
    a.bought.map((e) => e.eventId),
    b.bought.map((e) => e.eventId)
  );
});

test('bought has 259 distinct (customer, product) pairs', () => {
  const ds = generateSeedDataset();
  const pairs = new Set();
  for (const e of ds.bought) pairs.add(`${e.customerId}|${e.productId}`);
  assert.equal(pairs.size, 259);
});

test('CUST_001..CUST_004 only buy PROD_001..PROD_004', () => {
  const ds = generateSeedDataset();
  const allowed = new Set(['PROD_001', 'PROD_002', 'PROD_003', 'PROD_004']);
  for (const e of ds.bought) {
    if (['CUST_001', 'CUST_002', 'CUST_003', 'CUST_004'].includes(e.customerId)) {
      assert.ok(allowed.has(e.productId), `${e.customerId} bought ${e.productId}`);
    }
  }
});

test('CUST_005 has no BOUGHT', () => {
  const ds = generateSeedDataset();
  for (const e of ds.bought) {
    assert.notEqual(e.customerId, 'CUST_005');
  }
});

test('CUST_006..CUST_055 do not buy PROD_001..PROD_004', () => {
  const ds = generateSeedDataset();
  const allowed = new Set(['PROD_001', 'PROD_002', 'PROD_003', 'PROD_004']);
  for (const e of ds.bought) {
    const n = Number.parseInt(e.customerId.slice(-3), 10);
    if (n >= 6 && n <= 55) {
      assert.ok(!allowed.has(e.productId), `${e.customerId} bought ${e.productId}`);
    }
  }
});

test('CUST_002 has exactly one duplicate PROD_003 purchase (2 events, distinct eventIds)', () => {
  const ds = generateSeedDataset();
  const events = ds.bought.filter((e) => e.customerId === 'CUST_002' && e.productId === 'PROD_003');
  assert.equal(events.length, 2);
  assert.notEqual(events[0].eventId, events[1].eventId);
});

test('productIds and customerIds are unique', () => {
  const ds = generateSeedDataset();
  const productIds = new Set(ds.products.map((p) => p.productId));
  assert.equal(productIds.size, ds.products.length);
  const customerIds = new Set(ds.customers.map((c) => c.customerId));
  assert.equal(customerIds.size, ds.customers.length);
});

test('every product has a categoryId within the 6 defined categories', () => {
  const ds = generateSeedDataset();
  const cats = new Set(ds.categories.map((c) => c.categoryId));
  for (const p of ds.products) {
    assert.ok(cats.has(p.categoryId));
  }
});

test('admin account has email admin@example.test and role=admin', () => {
  const ds = generateSeedDataset();
  const admin = ds.customers.find((c) => c.customerId === 'ADMIN_001');
  assert.ok(admin);
  assert.equal(admin.email, 'admin@example.test');
  assert.equal(admin.role, 'admin');
});

test('customer emails follow the custNNN@example.test pattern', () => {
  const ds = generateSeedDataset();
  const c1 = ds.customers.find((c) => c.customerId === 'CUST_001');
  assert.equal(c1.email, 'cust001@example.test');
  const c55 = ds.customers.find((c) => c.customerId === 'CUST_055');
  assert.equal(c55.email, 'cust055@example.test');
});

test('validateSeedDataset detects an invalid dataset (foreign productId)', () => {
  const ds = generateSeedDataset();
  ds.bought.push({ eventId: 'BAD', customerId: 'CUST_001', productId: 'PROD_999', quantity: 1, unitPrice: 1, purchasedAt: new Date() });
  const v = validateSeedDataset(ds);
  assert.equal(v.ok, false);
  assert.ok(v.errors.length > 0);
});

test('bought eventIds are unique', () => {
  const ds = generateSeedDataset();
  const ids = new Set(ds.bought.map((e) => e.eventId));
  assert.equal(ids.size, ds.bought.length);
});

test('viewed eventIds are unique', () => {
  const ds = generateSeedDataset();
  const ids = new Set(ds.viewed.map((e) => e.eventId));
  assert.equal(ids.size, ds.viewed.length);
});

test('customers have unique individual passwords (no shared demo passwords)', () => {
  const ds = generateSeedDataset();
  const passwords = new Set(ds.customers.map((c) => c.password));
  assert.equal(passwords.size, ds.customers.length);
  const admin = ds.customers.find((c) => c.customerId === 'ADMIN_001');
  assert.equal(admin.password, 'Admin@001');
  const c1 = ds.customers.find((c) => c.customerId === 'CUST_001');
  assert.equal(c1.password, 'Cust@001');
  const c55 = ds.customers.find((c) => c.customerId === 'CUST_055');
  assert.equal(c55.password, 'Cust@055');
});
