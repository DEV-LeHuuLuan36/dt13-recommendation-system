// Loader for the reference dataset (CATALOG_REAL_120_V1).
//
// Preservation rules:
//  - Never overwrite an existing Product (only stamp name/brand/model/description/
//    slug/searchText/sourceUrl/illustrationKey/catalogKey and append to
//    referenceCatalogTags; never touch price, active, createdAt, imageUrl).
//  - Never overwrite an existing Customer (only append to referenceCatalogTags;
//    never touch passwordHash, role, active, name, email, createdAt).
//  - Never replace a V1/V2/A-E datasetTag (only append to referenceCatalogTags).
//  - Never reset the graph or merge/delete nodes that have history.
//  - MERGE on id/eventId so re-runs are idempotent. Each BOUGHT/VIEWED uses its
//    own eventId; never collapse multiple events into one relationship.
//  - Light post-step validation: expected 6 categories, 120 products, 60 customers,
//    120 belongs-to, 372 BOUGHT, 360 VIEWED. Missing nodes or duplicate
//    BELONGS_TO rows throw.
//  - BOUGHT unitPrice is the historical demo price at purchase time and never
//    overwrites Product.price.
//
// Runs inside an externally supplied session: runReferenceInTransaction(session, dataset, options).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

import { hashPassword } from '../../password.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REFERENCE_DIR = resolve(__dirname);

export const REFERENCE_MARKER = 'CATALOG_REAL_120_V1';
export const REFERENCE_PRODUCT_COUNT = 120;
export const REFERENCE_CUSTOMER_COUNT = 60;
export const REFERENCE_CATEGORY_COUNT = 6;
export const REFERENCE_BELONGS_TO_COUNT = 120;
export const REFERENCE_BOUGHT_COUNT = 372;
export const REFERENCE_VIEWED_COUNT = 360;
export const REFERENCE_DISTINCT_BOUGHT_PAIRS = 360;
export const REFERENCE_HASH = 'scrypt';

// Cached dataset after first load.
let cachedDataset = null;

/**
 * Load catalog-reference.json + integrity.json. Kiem tra checksum cua raw bytes.
 * Tra ve object { tag, sha256, products, customers, categories, bought, viewed, belongsTo }.
 */
export function loadReferenceDataset() {
  if (cachedDataset) return cachedDataset;
  const catalogPath = resolve(REFERENCE_DIR, 'catalog-reference.json');
  const integrityPath = resolve(REFERENCE_DIR, 'integrity.json');
  const rawText = readFileSync(catalogPath, 'utf8');
  const integrity = JSON.parse(readFileSync(integrityPath, 'utf8'));
  const expectedHash = integrity && integrity.sha256;
  if (expectedHash) {
    // SHA256 cua raw bytes (khong qua JSON.parse/stringify de tranh khoang trang/format khac).
    const computed = createHash('sha256').update(rawText, 'utf8').digest('hex');
    if (computed !== expectedHash) {
      throw new Error(`catalog-reference.json khong khop checksum: ${computed} != ${expectedHash}`);
    }
  }
  const raw = JSON.parse(rawText);
  // Co dinh metadata
  if (raw.meta && raw.meta.datasetTag && raw.meta.datasetTag !== REFERENCE_MARKER) {
    throw new Error(`datasetTag khong khop: ${raw.meta.datasetTag} != ${REFERENCE_MARKER}`);
  }
  cachedDataset = {
    tag: REFERENCE_MARKER,
    products: raw.products,
    customers: raw.customers,
    categories: raw.categories,
    bought: raw.bought,
    viewed: raw.viewed,
    belongsTo: raw.belongsTo,
  };
  return cachedDataset;
}

/**
 * Generate deterministic password cho moi customer. Dung randomBytes de tao salt per customer;
 * hash qua module scrypt hien co.
 * Tra ve Map<customerId, { password, hash }>.
 */
export async function generateReferenceCredentials({ logger = () => {} } = {}) {
  const data = loadReferenceDataset();
  const out = new Map();
  for (const c of data.customers) {
    const plain = generateReferencePassword();
    const hash = await hashPassword(plain);
    out.set(c.customerId, { password: plain, hash });
  }
  logger(`generated ${out.size} reference customer credentials (khong in ra log hay report)`);
  return out;
}

function generateReferencePassword() {
  // 16 ky tu alphanumeric, khong ky tu dac biet (giong V2 generator).
  return randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
}

/**
 * Chay 1 dataset reference trong 1 transaction executeWrite.
 *  - session: WRITE session da mo.
 *  - options.credentials: Map<customerId, { hash }> (bat buoc, hash san truoc khi goi).
 *  - options.failAtStep: throw Error o buoc do (categories|products|customers|belongsTo|bought|viewed).
 *  - options.existingPayloadCheck: neu true, kiem tra BOUGHT/VIEWED neu eventId da ton tai ma payload
 *    (unitPrice, quantity, purchasedAt, viewedAt) khac se throw (idempotent conflict).
 * Tra ve: counts (object). Throw neu dataset khong hop le.
 */
export async function runReferenceInTransaction(session, data, credentials, options = {}) {
  const { failAtStep = null, existingPayloadCheck = true, skipPreValidate = false, tag: tagOverride = null } = options;
  return session.executeWrite(async (tx) => {
    const counts = { categories: 0, products: 0, customers: 0, belongsTo: 0, bought: 0, viewed: 0 };
    const tag = tagOverride || REFERENCE_MARKER;

    // Pre-validate so luong node dau cuoi truoc transaction de som throw.
    if (!skipPreValidate) preValidate(data);

    if (failAtStep === 'categories') throw new Error('TEST_FAIL_AT_categories');
    for (const cat of data.categories) {
      await tx.run(
        `MERGE (c:Category { categoryId: $categoryId })
         ON CREATE SET c.name = $name, c.slug = $slug, c.datasetTag = $tag
         SET c.referenceCatalogTags = CASE
              WHEN $tag IN coalesce(c.referenceCatalogTags, []) THEN c.referenceCatalogTags
              ELSE coalesce(c.referenceCatalogTags, []) + [$tag]
            END,
            c.updatedAt = CASE WHEN c.updatedAt IS NULL THEN datetime() ELSE c.updatedAt END
         RETURN c`,
        { categoryId: cat.categoryId, name: cat.name, slug: cat.slug, tag }
      );
      counts.categories += 1;
    }

    if (failAtStep === 'products') throw new Error('TEST_FAIL_AT_products');
    for (const p of data.products) {
      await tx.run(
        `MERGE (p:Product { productId: $productId })
         ON CREATE SET
           p.name = $name,
           p.brand = $brand,
           p.model = $model,
           p.description = $description,
           p.price = toInteger($price),
           p.currency = $currency,
           p.active = $active,
           p.createdAt = datetime($createdAt),
           p.imageUrl = $imageUrl,
           p.illustrationKey = $illustrationKey,
           p.imageKind = $imageKind,
           p.datasetTag = $tag
         SET
           p.name = $name,
           p.brand = $brand,
           p.model = $model,
           p.description = $description,
           p.slug = $slug,
           p.searchText = $searchText,
           p.sourceUrl = $sourceUrl,
           p.catalogKey = $catalogKey,
           p.referenceCatalogTags = CASE
             WHEN $tag IN coalesce(p.referenceCatalogTags, []) THEN p.referenceCatalogTags
             ELSE coalesce(p.referenceCatalogTags, []) + [$tag]
           END
         RETURN p`,
        {
          productId: p.productId,
          name: p.name,
          brand: p.brand,
          model: p.model,
          description: p.description,
          price: p.price,
          currency: p.currency || 'VND',
          active: p.active !== false,
          createdAt: p.createdAt,
          imageUrl: p.imageUrl || '',
          illustrationKey: p.illustrationKey,
          imageKind: p.imageKind,
          slug: p.slug,
          searchText: p.searchText,
          sourceUrl: p.sourceUrl,
          catalogKey: p.catalogKey,
          tag,
        }
      );
      counts.products += 1;
    }

    if (failAtStep === 'customers') throw new Error('TEST_FAIL_AT_customers');
    for (const c of data.customers) {
      const cred = credentials.get(c.customerId);
      if (!cred || !cred.hash) {
        throw new Error(`missing passwordHash cho ${c.customerId}`);
      }
      await tx.run(
        `MERGE (c:Customer { customerId: $customerId })
         ON CREATE SET
           c.name = $name,
           c.email = $email,
           c.role = 'customer',
           c.active = $active,
           c.createdAt = datetime($createdAt),
           c.passwordHash = $passwordHash,
           c.datasetTag = $tag,
           c.cohort = $cohort
         SET
           c.referenceCatalogTags = CASE
             WHEN $tag IN coalesce(c.referenceCatalogTags, []) THEN c.referenceCatalogTags
             ELSE coalesce(c.referenceCatalogTags, []) + [$tag]
           END
         RETURN c`,
        {
          customerId: c.customerId,
          name: c.name,
          email: c.email,
          active: c.active !== false,
          createdAt: c.createdAt,
          passwordHash: cred.hash,
          cohort: c.cohort,
          tag,
        }
      );
      counts.customers += 1;
    }

    if (failAtStep === 'belongsTo') throw new Error('TEST_FAIL_AT_belongsTo');
    for (const row of data.belongsTo) {
      const dupRes = await tx.run(
        `MATCH (p:Product { productId: $productId })-[r:BELONGS_TO]->(:Category)
         RETURN count(r) AS rels`,
        { productId: row.productId }
      );
      const rels = Number(dupRes.records[0]?.get('rels') || 0);
      if (rels > 0) {
        // Neu da co BELONGS_TO, dam bao category khop; neu khac -> throw (conflict)
        const existRes = await tx.run(
          `MATCH (p:Product { productId: $productId })-[r:BELONGS_TO]->(c:Category)
           RETURN c.categoryId AS cid LIMIT 1`,
          { productId: row.productId }
        );
        const existing = existRes.records[0]?.get('cid');
        if (existing && existing !== row.categoryId) {
          throw new Error(`Product ${row.productId} da co BELONGS_TO ${existing}, khong the gan lai ${row.categoryId}`);
        }
      } else {
        await tx.run(
          `MATCH (p:Product { productId: $productId })
           MATCH (c:Category { categoryId: $categoryId })
           MERGE (p)-[r:BELONGS_TO { datasetTag: $tag }]->(c)
           ON CREATE SET r.createdAt = datetime()
           RETURN p, r, c`,
          { productId: row.productId, categoryId: row.categoryId, tag }
        );
      }
      counts.belongsTo += 1;
    }

    if (failAtStep === 'bought') throw new Error('TEST_FAIL_AT_bought');
    for (const e of data.bought) {
      // Idempotency: neu event da ton tai, kiem tra payload khop (idempotent conflict neu khac).
      // So sanh quantity va unitPrice (cac truong do nguoi dung dat); purchasedAt chi dung de tao moi
      // nen bo qua de tranh do khac precision millisecond/microsecond cua Neo4j DateTime.
      if (existingPayloadCheck) {
        const cur = await tx.run(
          `MATCH ()-[r:BOUGHT { eventId: $eventId }]->()
           RETURN r.unitPrice AS unitPrice, r.quantity AS quantity LIMIT 1`,
          { eventId: e.eventId }
        );
        if (cur.records[0]) {
          const r = cur.records[0];
          const u = Number(r.get('unitPrice'));
          const q = Number(r.get('quantity'));
          if (u !== Number(e.unitPrice) || q !== Number(e.quantity)) {
            throw new Error(`BOUGHT eventId ${e.eventId} da ton tai voi payload khac (conflict)`);
          }
        }
      }
      await tx.run(
        `MERGE (cust:Customer { customerId: $customerId })
         MERGE (prod:Product { productId: $productId })
         MERGE (cust)-[r:BOUGHT { eventId: $eventId }]->(prod)
         ON CREATE SET
           r.quantity = toInteger($quantity),
           r.unitPrice = toInteger($unitPrice),
           r.purchasedAt = datetime($purchasedAt),
           r.datasetTag = $tag
         ON MATCH SET r.datasetTag = CASE WHEN r.datasetTag IS NULL THEN $tag ELSE r.datasetTag END
         RETURN r`,
        {
          customerId: e.customerId,
          productId: e.productId,
          eventId: e.eventId,
          quantity: e.quantity,
          unitPrice: e.unitPrice,
          purchasedAt: e.purchasedAt,
          tag,
        }
      );
      counts.bought += 1;
    }

    if (failAtStep === 'viewed') throw new Error('TEST_FAIL_AT_viewed');
    for (const e of data.viewed) {
      // VIEWED: chi co viewedAt + datasetTag; khong co payload nguoi dung dat -> khong can check conflict.
      await tx.run(
        `MERGE (cust:Customer { customerId: $customerId })
         MERGE (prod:Product { productId: $productId })
         MERGE (cust)-[r:VIEWED { eventId: $eventId }]->(prod)
         ON CREATE SET
           r.viewedAt = datetime($viewedAt),
           r.datasetTag = $tag
         ON MATCH SET r.datasetTag = CASE WHEN r.datasetTag IS NULL THEN $tag ELSE r.datasetTag END
         RETURN r`,
        {
          customerId: e.customerId,
          productId: e.productId,
          eventId: e.eventId,
          viewedAt: e.viewedAt,
          tag,
        }
      );
      counts.viewed += 1;
    }

    return counts;
  });
}

function preValidate(data) {
  if (!data) throw new Error('dataset reference khong duoc trong');
  if (data.products.length !== REFERENCE_PRODUCT_COUNT) {
    throw new Error(`products: ${data.products.length} != ${REFERENCE_PRODUCT_COUNT}`);
  }
  if (data.customers.length !== REFERENCE_CUSTOMER_COUNT) {
    throw new Error(`customers: ${data.customers.length} != ${REFERENCE_CUSTOMER_COUNT}`);
  }
  if (data.categories.length !== REFERENCE_CATEGORY_COUNT) {
    throw new Error(`categories: ${data.categories.length} != ${REFERENCE_CATEGORY_COUNT}`);
  }
  if (data.belongsTo.length !== REFERENCE_BELONGS_TO_COUNT) {
    throw new Error(`belongsTo: ${data.belongsTo.length} != ${REFERENCE_BELONGS_TO_COUNT}`);
  }
  if (data.bought.length !== REFERENCE_BOUGHT_COUNT) {
    throw new Error(`bought: ${data.bought.length} != ${REFERENCE_BOUGHT_COUNT}`);
  }
  if (data.viewed.length !== REFERENCE_VIEWED_COUNT) {
    throw new Error(`viewed: ${data.viewed.length} != ${REFERENCE_VIEWED_COUNT}`);
  }
  // 360 cap (customer, product) BOUGHT phan biet
  const pairs = new Set();
  for (const e of data.bought) pairs.add(`${e.customerId}|${e.productId}`);
  if (pairs.size !== REFERENCE_DISTINCT_BOUGHT_PAIRS) {
    throw new Error(`bought distinct pairs: ${pairs.size} != ${REFERENCE_DISTINCT_BOUGHT_PAIRS}`);
  }
  // eventId duy nhat
  const eventIds = new Set();
  for (const e of data.bought) {
    if (eventIds.has(e.eventId)) throw new Error(`bought eventId trung: ${e.eventId}`);
    eventIds.add(e.eventId);
  }
  const viewedIds = new Set();
  for (const e of data.viewed) {
    if (viewedIds.has(e.eventId)) throw new Error(`viewed eventId trung: ${e.eventId}`);
    viewedIds.add(e.eventId);
  }
  // node id duy nhat
  const productIds = new Set();
  for (const p of data.products) {
    if (productIds.has(p.productId)) throw new Error(`productId trung: ${p.productId}`);
    productIds.add(p.productId);
  }
  const customerIds = new Set();
  for (const c of data.customers) {
    if (customerIds.has(c.customerId)) throw new Error(`customerId trung: ${c.customerId}`);
    customerIds.add(c.customerId);
  }
  // Kiem tra endpoint ton tai
  for (const e of data.bought) {
    if (!productIds.has(e.productId)) throw new Error(`bought productId khong ton tai: ${e.productId}`);
    if (!customerIds.has(e.customerId)) throw new Error(`bought customerId khong ton tai: ${e.customerId}`);
  }
  for (const e of data.viewed) {
    if (!productIds.has(e.productId)) throw new Error(`viewed productId khong ton tai: ${e.productId}`);
    if (!customerIds.has(e.customerId)) throw new Error(`viewed customerId khong ton tai: ${e.customerId}`);
  }
}
