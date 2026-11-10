import neo4j from 'neo4j-driver';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const driver = neo4j.driver('bolt://127.0.0.1:7687', neo4j.auth.basic('neo4j', '12345678'), { disableLosslessIntegers: true });
  const session = driver.session({ database: 'neo4j' });

  function serializeVal(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object' && val.year !== undefined && val.month !== undefined) {
      return val.toString();
    }
    if (Array.isArray(val)) return val.map(serializeVal);
    if (typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) out[k] = serializeVal(v);
      return out;
    }
    return val;
  }

  // 1. Fetch data
  const catRes = await session.run('MATCH (c:Category) RETURN c ORDER BY c.categoryId');
  const categories = catRes.records.map(r => serializeVal(r.get('c').properties));

  const prodRes = await session.run('MATCH (p:Product) RETURN p ORDER BY p.productId');
  const products = prodRes.records.map(r => serializeVal(r.get('p').properties));

  const custRes = await session.run('MATCH (c:Customer) RETURN c ORDER BY c.customerId');
  const customers = custRes.records.map(r => serializeVal(r.get('c').properties));

  const btRes = await session.run('MATCH (p:Product)-[r:BELONGS_TO]->(c:Category) RETURN p.productId AS pid, c.categoryId AS cid, properties(r) AS props');
  const belongsTo = btRes.records.map(r => ({ productId: r.get('pid'), categoryId: r.get('cid'), ...serializeVal(r.get('props')) }));

  const bRes = await session.run('MATCH (c:Customer)-[r:BOUGHT]->(p:Product) RETURN c.customerId AS cid, p.productId AS pid, properties(r) AS props ORDER BY r.eventId');
  const bought = bRes.records.map(r => ({ customerId: r.get('cid'), productId: r.get('pid'), ...serializeVal(r.get('props')) }));

  const vRes = await session.run('MATCH (c:Customer)-[r:VIEWED]->(p:Product) RETURN c.customerId AS cid, p.productId AS pid, properties(r) AS props ORDER BY r.eventId');
  const viewed = vRes.records.map(r => ({ customerId: r.get('cid'), productId: r.get('pid'), ...serializeVal(r.get('props')) }));

  const dbDir = path.resolve(__dirname, '../../database');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  // 1. JSON Export
  const dbData = {
    metadata: {
      project: 'DT13 - He thong goi y san pham tuong quan tren Neo4j',
      institution: 'Truong Dai hoc Cong Thuong TP.HCM (HUIT)',
      course: 'Du lieu NoSQL',
      exportedAt: new Date().toISOString(),
      counts: {
        categories: categories.length,
        products: products.length,
        customers: customers.length,
        belongsTo: belongsTo.length,
        bought: bought.length,
        viewed: viewed.length
      }
    },
    categories,
    products,
    customers,
    belongsTo,
    bought,
    viewed
  };
  fs.writeFileSync(path.join(dbDir, 'dt13_database_export.json'), JSON.stringify(dbData, null, 2), 'utf8');

  // 2. Cypher Dump
  let cypher = '// =====================================================================\n';
  cypher += '// CO SO DU LIEU DO THI NEO4J - DE TAI 13 (DT13)\n';
  cypher += '// HE THONG GOI Y SAN PHAM TUONG QUAN (RECOMMENDATION SYSTEM)\n';
  cypher += '// TRUONG DAI HOC CONG THUONG TP.HCM (HUIT) - KHOA CNTT\n';
  cypher += `// Ngay xuat: ${new Date().toISOString()}\n`;
  cypher += `// Thong ke: ${categories.length} Categories, ${products.length} Products, ${customers.length} Customers,\n`;
  cypher += `//           ${belongsTo.length} BELONGS_TO, ${bought.length} BOUGHT, ${viewed.length} VIEWED\n`;
  cypher += '// =====================================================================\n\n';

  cypher += '// --- 1. RANG BUOC TOAN VEN DUY NHAT (CONSTRAINTS) ---\n';
  cypher += 'CREATE CONSTRAINT category_categoryId_unique IF NOT EXISTS FOR (c:Category) REQUIRE c.categoryId IS UNIQUE;\n';
  cypher += 'CREATE CONSTRAINT product_productId_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.productId IS UNIQUE;\n';
  cypher += 'CREATE CONSTRAINT customer_customerId_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.customerId IS UNIQUE;\n';
  cypher += 'CREATE CONSTRAINT customer_email_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.email IS UNIQUE;\n';
  cypher += 'CREATE CONSTRAINT bought_eventId_unique IF NOT EXISTS FOR ()-[r:BOUGHT]-() REQUIRE r.eventId IS UNIQUE;\n';
  cypher += 'CREATE CONSTRAINT viewed_eventId_unique IF NOT EXISTS FOR ()-[r:VIEWED]-() REQUIRE r.eventId IS UNIQUE;\n\n';

  cypher += '// --- 2. KHOI TAO DANH MUC (CATEGORIES) ---\n';
  cypher += 'UNWIND ' + JSON.stringify(categories) + ' AS row\n';
  cypher += 'MERGE (c:Category { categoryId: row.categoryId })\n';
  cypher += 'SET c.name = row.name,\n';
  cypher += '    c.slug = row.slug,\n';
  cypher += '    c.datasetTag = row.datasetTag,\n';
  cypher += '    c.referenceCatalogTags = row.referenceCatalogTags,\n';
  cypher += '    c.updatedAt = CASE WHEN row.updatedAt IS NOT NULL THEN datetime(row.updatedAt) ELSE datetime() END;\n\n';

  cypher += '// --- 3. KHOI TAO SAN PHAM (PRODUCTS) ---\n';
  cypher += 'UNWIND ' + JSON.stringify(products) + ' AS row\n';
  cypher += 'MERGE (p:Product { productId: row.productId })\n';
  cypher += 'SET p.name = row.name,\n';
  cypher += '    p.slug = row.slug,\n';
  cypher += '    p.brand = row.brand,\n';
  cypher += '    p.model = row.model,\n';
  cypher += '    p.price = row.price,\n';
  cypher += '    p.currency = row.currency,\n';
  cypher += '    p.description = row.description,\n';
  cypher += '    p.imageUrl = row.imageUrl,\n';
  cypher += '    p.searchText = row.searchText,\n';
  cypher += '    p.catalogKey = row.catalogKey,\n';
  cypher += '    p.sourceUrl = row.sourceUrl,\n';
  cypher += '    p.active = row.active,\n';
  cypher += '    p.illustrationKey = row.illustrationKey,\n';
  cypher += '    p.imageKind = row.imageKind,\n';
  cypher += '    p.datasetTag = row.datasetTag,\n';
  cypher += '    p.referenceCatalogTags = row.referenceCatalogTags,\n';
  cypher += '    p.createdAt = CASE WHEN row.createdAt IS NOT NULL THEN datetime(row.createdAt) ELSE datetime() END;\n\n';

  cypher += '// --- 4. KHOI TAO NGUOI DUNG / KHACH HANG & ADMIN (CUSTOMERS) ---\n';
  cypher += 'UNWIND ' + JSON.stringify(customers) + ' AS row\n';
  cypher += 'MERGE (c:Customer { customerId: row.customerId })\n';
  cypher += 'SET c.name = row.name,\n';
  cypher += '    c.email = row.email,\n';
  cypher += '    c.role = row.role,\n';
  cypher += '    c.cohort = row.cohort,\n';
  cypher += '    c.active = row.active,\n';
  cypher += '    c.passwordHash = row.passwordHash,\n';
  cypher += '    c.datasetTag = row.datasetTag,\n';
  cypher += '    c.referenceCatalogTags = row.referenceCatalogTags,\n';
  cypher += '    c.createdAt = CASE WHEN row.createdAt IS NOT NULL THEN datetime(row.createdAt) ELSE datetime() END,\n';
  cypher += '    c.updatedAt = CASE WHEN row.updatedAt IS NOT NULL THEN datetime(row.updatedAt) ELSE null END;\n\n';

  cypher += '// --- 5. LIEN KET SAN PHAM VA DANH MUC (BELONGS_TO) ---\n';
  cypher += 'UNWIND ' + JSON.stringify(belongsTo) + ' AS row\n';
  cypher += 'MATCH (p:Product { productId: row.productId })\n';
  cypher += 'MATCH (c:Category { categoryId: row.categoryId })\n';
  cypher += 'MERGE (p)-[r:BELONGS_TO]->(c)\n';
  cypher += 'SET r.datasetTag = row.datasetTag,\n';
  cypher += '    r.updatedAt = CASE WHEN row.updatedAt IS NOT NULL THEN datetime(row.updatedAt) ELSE datetime() END;\n\n';

  cypher += '// --- 6. HANH VI MUA HANG (BOUGHT) ---\n';
  cypher += 'UNWIND ' + JSON.stringify(bought) + ' AS row\n';
  cypher += 'MATCH (c:Customer { customerId: row.customerId })\n';
  cypher += 'MATCH (p:Product { productId: row.productId })\n';
  cypher += 'MERGE (c)-[r:BOUGHT { eventId: row.eventId }]->(p)\n';
  cypher += 'SET r.unitPrice = row.unitPrice,\n';
  cypher += '    r.quantity = row.quantity,\n';
  cypher += '    r.datasetTag = row.datasetTag,\n';
  cypher += '    r.purchasedAt = CASE WHEN row.purchasedAt IS NOT NULL THEN datetime(row.purchasedAt) ELSE datetime() END;\n\n';

  cypher += '// --- 7. HANH VI XEM SAN PHAM (VIEWED) ---\n';
  cypher += 'UNWIND ' + JSON.stringify(viewed) + ' AS row\n';
  cypher += 'MATCH (c:Customer { customerId: row.customerId })\n';
  cypher += 'MATCH (p:Product { productId: row.productId })\n';
  cypher += 'MERGE (c)-[r:VIEWED { eventId: row.eventId }]->(p)\n';
  cypher += 'SET r.datasetTag = row.datasetTag,\n';
  cypher += '    r.durationSeconds = row.durationSeconds,\n';
  cypher += '    r.viewedAt = CASE WHEN row.viewedAt IS NOT NULL THEN datetime(row.viewedAt) ELSE datetime() END;\n\n';

  cypher += '// --- 8. XAC MINH SO LUONG THUC THE VA QUAN HE ---\n';
  cypher += 'CALL { MATCH (c:Category) RETURN count(c) AS categories }\n';
  cypher += 'CALL { MATCH (p:Product) RETURN count(p) AS products }\n';
  cypher += 'CALL { MATCH (c:Customer) RETURN count(c) AS customers }\n';
  cypher += 'CALL { MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS belongsTo }\n';
  cypher += 'CALL { MATCH ()-[r:BOUGHT]->() RETURN count(r) AS bought }\n';
  cypher += 'CALL { MATCH ()-[r:VIEWED]->() RETURN count(r) AS viewed }\n';
  cypher += 'RETURN categories, products, customers, belongsTo, bought, viewed;\n';

  fs.writeFileSync(path.join(dbDir, 'dt13_full_database_dump.cypher'), cypher, 'utf8');

  // 3. Schema constraints
  let schema = '// =====================================================================\n';
  schema += '// RÀNG BUỘC TOÀN VẸN & CHỈ MỤC - CSDL ĐỒ THỊ NEO4J ĐỀ TÀI 13\n';
  schema += '// =====================================================================\n\n';
  schema += 'CREATE CONSTRAINT category_categoryId_unique IF NOT EXISTS FOR (c:Category) REQUIRE c.categoryId IS UNIQUE;\n';
  schema += 'CREATE CONSTRAINT product_productId_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.productId IS UNIQUE;\n';
  schema += 'CREATE CONSTRAINT customer_customerId_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.customerId IS UNIQUE;\n';
  schema += 'CREATE CONSTRAINT customer_email_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.email IS UNIQUE;\n';
  schema += 'CREATE CONSTRAINT bought_eventId_unique IF NOT EXISTS FOR ()-[r:BOUGHT]-() REQUIRE r.eventId IS UNIQUE;\n';
  schema += 'CREATE CONSTRAINT viewed_eventId_unique IF NOT EXISTS FOR ()-[r:VIEWED]-() REQUIRE r.eventId IS UNIQUE;\n';
  schema += 'CREATE CONSTRAINT guest_guestId_unique IF NOT EXISTS FOR (g:GuestSession) REQUIRE g.guestId IS UNIQUE;\n';
  schema += 'CREATE CONSTRAINT search_eventId_unique IF NOT EXISTS FOR (s:SearchEvent) REQUIRE s.eventId IS UNIQUE;\n';
  fs.writeFileSync(path.join(dbDir, 'schema_constraints.cypher'), schema, 'utf8');

  // 4. Copy catalog-reference.json
  const refSrc = path.resolve(__dirname, '../src/seed/reference/catalog-reference.json');
  if (fs.existsSync(refSrc)) {
    fs.copyFileSync(refSrc, path.join(dbDir, 'catalog-reference.json'));
  }

  // 5. Write instructions
  const guide = `================================================================================
HƯỚNG DẪN KHÔI PHỤC VÀ IMPORT CƠ SỞ DỮ LIỆU ĐỒ THỊ NEO4J - ĐỀ TÀI 13
HỆ THỐNG GỢI Ý SẢN PHẨM TƯƠNG QUAN (RECOMMENDATION SYSTEM)
Trường Đại học Công Thương TP.HCM (HUIT) - Khoa Công nghệ Thông tin
================================================================================

Thư mục này cung cấp đầy đủ các file dữ liệu và kịch bản khởi tạo CSDL Neo4j:
1. dt13_full_database_dump.cypher: File kịch bản Cypher hoàn chỉnh xuất từ CSDL thực tế.
   Chứa đầy đủ: Ràng buộc duy nhất (Constraints), 6 Categories, 120 Products, 65 Customers
   (bao gồm tài khoản Admin và mật khẩu hash scrypt), 120 BELONGS_TO, 374 BOUGHT, 363 VIEWED.
2. dt13_database_export.json: Dữ liệu CSDL xuất dưới định dạng JSON có cấu trúc.
3. catalog-reference.json: Bộ dữ liệu mẫu Reference Catalog chuẩn (120 sản phẩm, 60 khách hàng).
4. schema_constraints.cypher: Kịch bản khởi tạo riêng các ràng buộc toàn vẹn duy nhất và index.

--------------------------------------------------------------------------------
CÁCH 1: KHỞI TẠO TỰ ĐỘNG BẰNG LỆNH NPM (KHUYẾN NGHỊ CHO MÃ NGUỒN)
--------------------------------------------------------------------------------
Tại thư mục gốc của dự án (hoặc thư mục backend):
1. Đảm bảo dịch vụ Neo4j đang chạy và thông tin kết nối trong file backend/.env chính xác.
2. Chạy lệnh tạo ràng buộc schema:
   npm run db:schema
3. Chạy lệnh nạp dữ liệu Reference Catalog (120 sản phẩm, 60 khách hàng, hành vi mua/xem):
   npm run db:seed:reference

--------------------------------------------------------------------------------
CÁCH 2: IMPORT BẰNG CYPHER SHELL TRÊN DÒNG LỆNH (TERMINAL / CMD)
--------------------------------------------------------------------------------
Chạy lệnh sau trên terminal (thay thế mật khẩu neo4j nếu có):
cypher-shell -u neo4j -p 12345678 -d neo4j -f dt13_full_database_dump.cypher

Lệnh này sẽ tự động chạy toàn bộ các khối lệnh Cypher và nạp dữ liệu hoàn tất trong vài giây.

--------------------------------------------------------------------------------
CÁCH 3: IMPORT BẰNG GIAO DIỆN NEO4J BROWSER (http://localhost:7474)
--------------------------------------------------------------------------------
1. Mở trình duyệt truy cập: http://localhost:7474 và đăng nhập vào Neo4j.
2. Mở file "dt13_full_database_dump.cypher" bằng Notepad hoặc VS Code.
3. Sao chép và chạy từng khối lệnh theo thứ tự:
   - Khối 1: Tạo các ràng buộc Constraints (CREATE CONSTRAINT ...)
   - Khối 2: Khởi tạo 6 Categories (UNWIND [...] MERGE ...)
   - Khối 3: Khởi tạo 120 Products (UNWIND [...] MERGE ...)
   - Khối 4: Khởi tạo 65 Customers (UNWIND [...] MERGE ...)
   - Khối 5: Tạo liên kết BELONGS_TO giữa Product và Category
   - Khối 6: Tạo quan hệ mua sắm BOUGHT giữa Customer và Product
   - Khối 7: Tạo quan hệ xem sản phẩm VIEWED giữa Customer và Product
   - Khối 8: Chạy câu lệnh kiểm tra số lượng để xác nhận.

--------------------------------------------------------------------------------
KIỂM TRA SỐ LƯỢNG TRONG NEO4J BROWSER:
--------------------------------------------------------------------------------
Chạy câu truy vấn Cypher:
CALL { MATCH (c:Category) RETURN count(c) AS categories }
CALL { MATCH (p:Product) RETURN count(p) AS products }
CALL { MATCH (c:Customer) RETURN count(c) AS customers }
CALL { MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS belongsTo }
CALL { MATCH ()-[r:BOUGHT]->() RETURN count(r) AS bought }
CALL { MATCH ()-[r:VIEWED]->() RETURN count(r) AS viewed }
RETURN categories, products, customers, belongsTo, bought, viewed;

Kết quả mong đợi:
- categories: 6
- products: 120
- customers: 65 (Admin + 60 khách hàng RC + các tài khoản test)
- belongsTo: 120
- bought >= 370 (Vượt định mức barem > 300)
- viewed >= 360
`;
  fs.writeFileSync(path.join(dbDir, 'HUONG_DAN_KHOI_PHUC_DATABASE.txt'), guide, 'utf8');

  console.log('Exported database successfully to:', dbDir);
  await session.close();
  await driver.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
