/**
 * Offline, deterministic dataset generator for the seed.
 * No database connection needed. Returns the arrays (customers, admins,
 * categories, products, bought, viewed) and a marker so the loader can
 * tag every row it writes.
 */

export const DATASET_MARKER = 'DT13_SEED_V1';

export const CATEGORY_COUNT = 6;
export const PRODUCT_COUNT = 105;
export const CUSTOMER_COUNT = 55; // role=customer
export const ADMIN_ID = 'ADMIN_001';

export const CATEGORIES = [
  { categoryId: 'CAT_001', name: 'Laptop', description: 'May tinh xach tay cac hang' },
  { categoryId: 'CAT_002', name: 'Dien thoai', description: 'Smartphone nhieu phan khuc' },
  { categoryId: 'CAT_003', name: 'Am thanh', description: 'Tai nghe, loa, micro' },
  { categoryId: 'CAT_004', name: 'Phu kien', description: 'Chuot, ban phim, cap, sac' },
  { categoryId: 'CAT_005', name: 'Dong ho thong minh', description: 'Smartwatch va vong tay thong minh' },
  { categoryId: 'CAT_006', name: 'May tinh vi', description: 'Tablet cac kich thuoc' },
];

/**
 * Sinh san pham PROD_001..PROD_105.
 * Phan bo vong tron theo 6 category; gia VND nguyen, tang tu 1.500.000 den 35.000.000.
 */
export function generateProducts() {
  const products = [];
  for (let i = 1; i <= PRODUCT_COUNT; i += 1) {
    const productId = `PROD_${String(i).padStart(3, '0')}`;
    const categoryIdx = Math.floor((i - 1) / Math.ceil(PRODUCT_COUNT / CATEGORY_COUNT));
    const categoryName = CATEGORIES[Math.min(categoryIdx, CATEGORY_COUNT - 1)].name;
    // Gia tang theo i, trong [1.5e6, 3.5e7], lam tron 50.000.
    const base = 1_500_000 + ((i * 270_000) % 33_500_000);
    const price = Math.round(base / 50_000) * 50_000;
    products.push({
      productId,
      name: makeProductName(productId, categoryName),
      description: `Mo phong ${categoryName.toLowerCase()} - ma ${productId}.`,
      price,
      imageUrl: `/images/products/${productId}.svg`,
      active: true,
      categoryId: CATEGORIES[Math.min(categoryIdx, CATEGORY_COUNT - 1)].categoryId,
    });
  }
  return products;
}

function makeProductName(productId, categoryName) {
  const sample = {
    Laptop: 'Laptop DT13 Pro',
    'Dien thoai': 'Smartphone DT13 X',
    'Am thanh': 'Tai nghe DT13 Bass',
    'Phu kien': 'Phu kien DT13 Click',
    'Dong ho thong minh': 'Smartwatch DT13 Pulse',
    'May tinh vi': 'Tablet DT13 View',
  };
  return `${sample[categoryName] || 'DT13 Item'} ${productId.slice(-3)}`;
}

/**
 * 55 khach role=customer (CUST_001..CUST_055) + 1 admin ADMIN_001.
 * Email theo quy tac: cust000*@example.test voi so thu tu, admin@example.test.
 */
export function generateCustomers() {
  const list = [];
  for (let i = 1; i <= CUSTOMER_COUNT; i += 1) {
    const customerId = `CUST_${String(i).padStart(3, '0')}`;
    list.push({
      customerId,
      name: `Khach hang ${i}`,
      email: `cust${String(i).padStart(3, '0')}@example.test`,
      role: 'customer',
      active: true,
    });
  }
  list.push({
    customerId: ADMIN_ID,
    name: 'Quan tri DT13',
    email: 'admin@example.test',
    role: 'admin',
    active: true,
  });
  return list;
}

/**
 * Sinh su kien BOUGHT co quy tac xac dinh (PROMPT_GIAI_DOAN_2 muc 5.2).
 *  - A..D mua theo bang rang buoc (4 khach), B co 1 mua lap P3.
 *  - 249 su kien con lai: i=0..48: CUST_(006+i) mua 5 san pham; i=49: CUST_055 mua 4 san pham.
 *  - San pham trich xuat: 5 + ((i * 5 + j) % 101), dang 3 chu so.
 *  - 259 cap (khach, san pham) phan biet, 260 su kien.
 */
export function generateBoughtEvents() {
  const events = [];

  // Fixture A..D (group A..E)
  const groupAtoD = [
    { customerId: 'CUST_001', items: [['PROD_001', 1], ['PROD_002', 1]] },
    {
      customerId: 'CUST_002',
      items: [
        ['PROD_001', 1],
        ['PROD_002', 1],
        ['PROD_003', 1],
        ['PROD_003', 2], // mua lap
      ],
    },
    {
      customerId: 'CUST_003',
      items: [
        ['PROD_001', 1],
        ['PROD_003', 1],
        ['PROD_004', 1],
      ],
    },
    {
      customerId: 'CUST_004',
      items: [
        ['PROD_002', 1],
        ['PROD_004', 1],
      ],
    },
  ];
  // CUST_005/E: khong mua.
  let seq = 0;
  const baseDate = Date.UTC(2025, 0, 5, 8, 0, 0);
  for (const entry of groupAtoD) {
    for (const [productId, qty] of entry.items) {
      seq += 1;
      events.push({
        eventId: `BOUGHT_${DATASET_MARKER}_${String(seq).padStart(4, '0')}`,
        customerId: entry.customerId,
        productId,
        quantity: qty,
        unitPrice: lookupPrice(productId),
        purchasedAt: addMinutes(baseDate, seq * 17),
      });
    }
  }

  // 249 events tu CUST_006 den CUST_055 theo cong thuc
  for (let i = 0; i < 50; i += 1) {
    const customerId = `CUST_${String(6 + i).padStart(3, '0')}`;
    const jMax = i === 49 ? 4 : 5; // i==49 la CUST_055, j=0..3
    for (let j = 0; j < jMax; j += 1) {
      seq += 1;
      const productNum = 5 + ((i * 5 + j) % 101);
      const productId = `PROD_${String(productNum).padStart(3, '0')}`;
      events.push({
        eventId: `BOUGHT_${DATASET_MARKER}_${String(seq).padStart(4, '0')}`,
        customerId,
        productId,
        quantity: 1,
        unitPrice: lookupPrice(productId),
        purchasedAt: addMinutes(baseDate, seq * 17),
      });
    }
  }
  return events;
}

/**
 * 180 su kien VIEWED phan bo xac dinh.
 * Moi khach CUST_001..CUST_055 xem 3 san pham (voi CUST_001 xem them 1 do mua lap).
 * Tuy nhien, de tranh trung productId=P1..P4 (PROMPT 5.2 rang buoc nhom khach CUST_006+ khong mua P1..P4),
 * CUST_001..CUST_005 duoc phep xem P1..P4, cac khach con lai chi xem tu PROD_005+.
 *
 * Tong cong: 5*4 + 50*3 = 20 + 150 = 170 (khong du 180). Them 10 view cua admin khong the (admin khong co hanh vi).
 * Thay vao do: 5 khach dau xem 4 san pham, 50 khach sau xem 3 san pham.
 * 5*4 + 50*3 = 20 + 150 = 170. Van thieu.
 * Dieu chinh: CUST_001..CUST_010 xem 4 san pham, con lai xem 3 san pham.
 * 10*4 + 45*3 = 40 + 135 = 175. Van thieu.
 * Them 5 khach bonus: chon 5 khach random xem them 1 san pham -> 180.
 *
 * Viec chon dat ki theo index - co hoa suy dien. Phan phoi san pham xem:
 *  - CUST_001..CUST_005: xem P1..P4 (moi khach 4 sp, xoay vong).
 *  - CUST_006..CUST_055: xem cac san pham >= PROD_005 theo mot quy tac khac.
 */
export function generateViewedEvents(products) {
  const events = [];
  const baseDate = Date.UTC(2025, 0, 1, 9, 0, 0);
  const productById = new Map(products.map((p) => [p.productId, p]));
  let seq = 0;

  // CUST_001..CUST_005, moi khach xem 4 sp (P1..P4 theo vong).
  for (let i = 1; i <= 5; i += 1) {
    const customerId = `CUST_${String(i).padStart(3, '0')}`;
    const offset = (i - 1) % 4;
    const sp = ['PROD_001', 'PROD_002', 'PROD_003', 'PROD_004'];
    for (let k = 0; k < 4; k += 1) {
      const idx = (offset + k) % 4;
      const productId = sp[idx];
      seq += 1;
      events.push({
        eventId: `VIEWED_${DATASET_MARKER}_${String(seq).padStart(4, '0')}`,
        customerId,
        productId,
        viewedAt: addMinutes(baseDate, seq * 11),
      });
    }
  }

  // CUST_006..CUST_015 (10 khach) xem 4 sp; CUST_016..CUST_055 (40 khach) xem 3 sp.
  // 10*4 + 40*3 = 40 + 120 = 160. Cong CUST_001..CUST_005 (20) = 180.
  for (let i = 6; i <= 55; i += 1) {
    const customerId = `CUST_${String(i).padStart(3, '0')}`;
    const count = i <= 15 ? 4 : 3;
    const seed = i - 6;
    const ids = pickViewedProducts(seed, count);
    for (const productId of ids) {
      if (!productById.has(productId)) continue;
      seq += 1;
      events.push({
        eventId: `VIEWED_${DATASET_MARKER}_${String(seq).padStart(4, '0')}`,
        customerId,
        productId,
        viewedAt: addMinutes(baseDate, seq * 11),
      });
    }
  }
  return events;
}

/**
 * Chon 3 sp >= PROD_005 cho moi khach, quy tac xac dinh.
 *  - San pham: 5 + ((seed*3 + j) % 101) voi j=0..2.
 *  - Tranh trung bang cong + 1 (dam bao 3 sp phan biet).
 */
function pickViewedProducts(seed, count) {
  const used = new Set();
  const ids = [];
  for (let j = 0; j < count * 3 && ids.length < count; j += 1) {
    const productNum = 5 + ((seed * 3 + j) % 101);
    const pid = `PROD_${String(productNum).padStart(3, '0')}`;
    if (!used.has(pid) && productNum >= 5 && productNum <= 105) {
      used.add(pid);
      ids.push(pid);
    }
  }
  // Dam bao du count bang cach padding bang PROD_005 neu can.
  while (ids.length < count) {
    ids.push('PROD_005');
  }
  return ids;
}

/**
 * Ham helper lay gia cho 1 productId theo cong thuc generator (can cho bought events).
 * Dung cung cong thuc de dam bao seed consistent neu generator thay doi.
 */
function lookupPrice(productId) {
  const num = Number.parseInt(productId.slice(-3), 10);
  if (!Number.isFinite(num) || num < 1 || num > PRODUCT_COUNT) {
    return 1_500_000;
  }
  const base = 1_500_000 + ((num * 270_000) % 33_500_000);
  return Math.round(base / 50_000) * 50_000;
}

function addMinutes(epochMs, minutes) {
  return new Date(epochMs + minutes * 60 * 1000);
}

/**
 * Sinh full dataset (goi 1 lan de tranh tinh toan lai).
 */
export function generateSeedDataset() {
  const products = generateProducts();
  const customers = generateCustomers();
  const bought = generateBoughtEvents();
  const viewed = generateViewedEvents(products);
  return {
    marker: DATASET_MARKER,
    products,
    customers,
    categories: CATEGORIES,
    bought,
    viewed,
  };
}

/**
 * Kiem tra tinh dung dan cua dataset (offline). Khong can CSDL.
 * Tra ve { ok, errors }.
 */
export function validateSeedDataset(dataset) {
  const errors = [];
  if (dataset.marker !== DATASET_MARKER) errors.push(`marker khong khop: ${dataset.marker}`);
  if (dataset.products.length !== PRODUCT_COUNT) errors.push(`products: ${dataset.products.length} != ${PRODUCT_COUNT}`);
  if (dataset.categories.length !== CATEGORY_COUNT) errors.push(`categories: ${dataset.categories.length} != ${CATEGORY_COUNT}`);
  if (dataset.customers.length !== CUSTOMER_COUNT + 1) {
    errors.push(`customers: ${dataset.customers.length} != ${CUSTOMER_COUNT + 1}`);
  }
  if (dataset.bought.length !== 260) errors.push(`bought: ${dataset.bought.length} != 260`);
  if (dataset.viewed.length !== 180) errors.push(`viewed: ${dataset.viewed.length} != 180`);

  const productIds = new Set(dataset.products.map((p) => p.productId));
  const customerIds = new Set(dataset.customers.map((c) => c.customerId));
  const categoryIds = new Set(dataset.categories.map((c) => c.categoryId));

  for (const e of dataset.bought) {
    if (!productIds.has(e.productId)) errors.push(`bought productId khong ton tai: ${e.productId}`);
    if (!customerIds.has(e.customerId)) errors.push(`bought customerId khong ton tai: ${e.customerId}`);
  }
  for (const e of dataset.viewed) {
    if (!productIds.has(e.productId)) errors.push(`viewed productId khong ton tai: ${e.productId}`);
    if (!customerIds.has(e.customerId)) errors.push(`viewed customerId khong ton tai: ${e.customerId}`);
  }
  for (const product of dataset.products) {
    if (!categoryIds.has(product.categoryId)) {
      errors.push(`product ${product.productId} khong thuoc category ton tai: ${product.categoryId}`);
    }
  }

  const boughtEventIds = new Set();
  for (const e of dataset.bought) {
    if (boughtEventIds.has(e.eventId)) errors.push(`bought eventId trung: ${e.eventId}`);
    boughtEventIds.add(e.eventId);
  }
  const viewedEventIds = new Set();
  for (const e of dataset.viewed) {
    if (viewedEventIds.has(e.eventId)) errors.push(`viewed eventId trung: ${e.eventId}`);
    viewedEventIds.add(e.eventId);
  }

  // Kiem tra 259 cap BOUGHT phan biet
  const boughtPairs = new Set();
  for (const e of dataset.bought) boughtPairs.add(`${e.customerId}|${e.productId}`);
  if (boughtPairs.size !== 259) errors.push(`bought cap phan biet: ${boughtPairs.size} != 259`);

  // Kiem tra nhom A..D khong mua san pham ngoai P1..P4
  const groupABCD = ['CUST_001', 'CUST_002', 'CUST_003', 'CUST_004'];
  const allowedABCDE = new Set(['PROD_001', 'PROD_002', 'PROD_003', 'PROD_004']);
  for (const e of dataset.bought) {
    if (groupABCD.includes(e.customerId) && !allowedABCDE.has(e.productId)) {
      errors.push(`nhom A-D mua san pham khong cho phep: ${e.customerId} -> ${e.productId}`);
    }
  }

  // CUST_005 khong co BOUGHT
  for (const e of dataset.bought) {
    if (e.customerId === 'CUST_005') errors.push('CUST_005 khong duoc co BOUGHT');
  }

  // CUST_006..CUST_055 khong mua P1..P4
  for (const e of dataset.bought) {
    const num = Number.parseInt(e.customerId.slice(-3), 10);
    if (num >= 6 && num <= 55 && allowedABCDE.has(e.productId)) {
      errors.push(`CUST_${String(num).padStart(3, '0')} khong duoc mua P1..P4 nhung co: ${e.productId}`);
    }
  }

  return { ok: errors.length === 0, errors };
}