// Export every V2 Product + related edges + V2-only Category as JSON to a backup
// directory outside the repository. Full property set + endpoint IDs are
// preserved so the data can be re-imported if needed.
import neo4j from 'neo4j-driver';
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../src/config.js';

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node db-backup-v2.js <backup-dir>');
    process.exit(2);
  }
  mkdirSync(target, { recursive: true });

  const config = loadConfig();
  const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), { disableLosslessIntegers: true });
  const session = driver.session({ database: config.neo4jDatabase, defaultAccessMode: neo4j.session.READ });
  try {
    // 1) V2 products (full props)
    const products = await session.run(`
      MATCH (p:Product)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      RETURN p
    `);
    const productList = products.records.map((r) => {
      const node = r.get('p');
      const out = { productId: node.properties.productId };
      for (const [k, v] of Object.entries(node.properties)) {
        if (k === 'productId') continue;
        out[k] = neo4jDateAware(v);
      }
      return out;
    });
    writeFileSync(`${target}/products.json`, JSON.stringify(productList, null, 2) + '\n', 'utf8');
    console.log(`products.json: ${productList.length}`);

    // 2) V2 customers (if any)
    const customers = await session.run(`
      MATCH (c:Customer)
      WHERE c.datasetTag = 'DT13_SEED_V2'
      RETURN c
    `);
    const customerList = customers.records.map((r) => {
      const node = r.get('c');
      const out = { customerId: node.properties.customerId };
      for (const [k, v] of Object.entries(node.properties)) {
        if (k === 'customerId') continue;
        out[k] = neo4jDateAware(v);
      }
      return out;
    });
    writeFileSync(`${target}/customers.json`, JSON.stringify(customerList, null, 2) + '\n', 'utf8');
    console.log(`customers.json: ${customerList.length}`);

    // 3) V2 categories
    const categories = await session.run(`
      MATCH (c:Category)
      WHERE c.datasetTag = 'DT13_SEED_V2'
      RETURN c
    `);
    const categoryList = categories.records.map((r) => {
      const node = r.get('c');
      const out = { categoryId: node.properties.categoryId };
      for (const [k, v] of Object.entries(node.properties)) {
        if (k === 'categoryId') continue;
        out[k] = neo4jDateAware(v);
      }
      return out;
    });
    writeFileSync(`${target}/categories.json`, JSON.stringify(categoryList, null, 2) + '\n', 'utf8');
    console.log(`categories.json: ${categoryList.length}`);

    // 4) BELONGS_TO from V2 products
    const belongsTo = await session.run(`
      MATCH (p:Product)-[r:BELONGS_TO]->(c:Category)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      RETURN p.productId AS productId, c.categoryId AS categoryId, r
    `);
    const btList = belongsTo.records.map((r) => {
      const rel = r.get('r');
      const out = { productId: r.get('productId'), categoryId: r.get('categoryId') };
      for (const [k, v] of Object.entries(rel.properties)) out[k] = neo4jDateAware(v);
      return out;
    });
    writeFileSync(`${target}/belongsTo.json`, JSON.stringify(btList, null, 2) + '\n', 'utf8');
    console.log(`belongsTo.json: ${btList.length}`);

    // 5) BOUGHT and VIEWED ending at V2 products (full)
    const bought = await session.run(`
      MATCH (c:Customer)-[r:BOUGHT]->(p:Product)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      RETURN c.customerId AS customerId, p.productId AS productId, r
    `);
    const bList = bought.records.map((r) => {
      const rel = r.get('r');
      const out = { customerId: r.get('customerId'), productId: r.get('productId') };
      for (const [k, v] of Object.entries(rel.properties)) out[k] = neo4jDateAware(v);
      return out;
    });
    writeFileSync(`${target}/bought.json`, JSON.stringify(bList, null, 2) + '\n', 'utf8');
    console.log(`bought.json: ${bList.length}`);

    const viewed = await session.run(`
      MATCH (c:Customer)-[r:VIEWED]->(p:Product)
      WHERE p.datasetTag = 'DT13_SEED_V2'
      RETURN c.customerId AS customerId, p.productId AS productId, r
    `);
    const vList = viewed.records.map((r) => {
      const rel = r.get('r');
      const out = { customerId: r.get('customerId'), productId: r.get('productId') };
      for (const [k, v] of Object.entries(rel.properties)) out[k] = neo4jDateAware(v);
      return out;
    });
    writeFileSync(`${target}/viewed.json`, JSON.stringify(vList, null, 2) + '\n', 'utf8');
    console.log(`viewed.json: ${vList.length}`);

    // 6) Manifest
    const manifest = {
      generatedAt: new Date().toISOString(),
      marker: 'DT13_SEED_V2',
      counts: {
        products: productList.length,
        customers: customerList.length,
        categories: categoryList.length,
        belongsTo: btList.length,
        bought: bList.length,
        viewed: vList.length,
      },
    };
    writeFileSync(`${target}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`manifest.json: ${JSON.stringify(manifest)}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

function neo4jDateAware(v) {
  if (v == null) return v;
  if (typeof v === 'object' && typeof v.toString === 'function' && v.year && v.month && v.day) {
    // neo4j DateTime
    return v.toString();
  }
  return v;
}

main().catch((e) => { console.error(e); process.exit(1); });
