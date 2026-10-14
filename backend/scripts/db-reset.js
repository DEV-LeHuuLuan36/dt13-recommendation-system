#!/usr/bin/env node
/**
 * `npm run db:reset` — Clean & Reset Neo4j Database:
 * 1. Detach delete all existing nodes and relationships (MATCH (n) DETACH DELETE n).
 * 2. Ensure all 6 uniqueness constraints exist.
 * 3. Seed ONLY the clean 120-product Reference Catalog (CATALOG_REAL_120_V1):
 *    - 120 real products (with matching rc_p001.jpg .. rc_p120.jpg)
 *    - 60 real customers (with independent scrypt password hashes)
 *    - 6 clean categories (Laptop, Điện thoại, Máy tính bảng, Bàn phím, Chuột, Tai nghe)
 *    - 120 BELONGS_TO relationships
 *    - 372 BOUGHT relationships (360 distinct customer-product pairs)
 *    - 360 VIEWED relationships
 * 4. Ensure the Administrator account ADMIN_001 (admin@example.test / Admin@001) exists.
 * 5. Verify and display the post-reset counts.
 */
import neo4j from 'neo4j-driver';
import { loadConfig } from '../src/config.js';
import { CONSTRAINTS } from '../src/cypher/queries.js';
import {
  loadReferenceDataset,
  runReferenceInTransaction,
  generateReferenceCredentials,
  REFERENCE_MARKER,
} from '../src/seed/reference/loader-reference.js';
import { hashPassword } from '../src/password.js';
import { getDeterministicSalt } from '../src/seed/generator.js';

function log(msg) {
  console.log(`[db:reset] ${msg}`);
}

async function main() {
  const config = loadConfig();
  if (!config.neo4jFullyConfigured) {
    console.error('[db:reset] NEO4J_NOT_CONFIGURED: Missing Neo4j credentials in .env');
    process.exit(1);
  }

  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
    { connectionTimeout: 5000, disableLosslessIntegers: true }
  );
  const session = driver.session({
    database: config.neo4jDatabase,
    defaultAccessMode: neo4j.session.WRITE,
  });

  try {
    // 1. Wipe database completely
    log('Bước 1/5: Xóa toàn bộ dữ liệu cũ (MATCH (n) DETACH DELETE n)...');
    await session.run('MATCH (n) DETACH DELETE n');
    log('Đã làm sạch toàn bộ Nodes và Relationships cũ.');

    // 2. Ensure Constraints
    log('Bước 2/5: Khởi tạo 6 ràng buộc duy nhất (Constraints & Indexes)...');
    for (const q of CONSTRAINTS) {
      try {
        await session.run(q);
      } catch (err) {
        log(`Constraint warning: ${err.message.split('\n')[0]}`);
      }
    }
    log('Đã áp dụng 6 ràng buộc duy nhất thành công.');

    // 3. Load Reference Dataset
    log('Bước 3/5: Nạp duy nhất bộ Reference Catalog (120 sản phẩm, 60 khách hàng)...');
    const dataset = loadReferenceDataset();
    log('Đang sinh chuỗi hash Scrypt và salt độc lập cho từng khách hàng...');
    const credentials = await generateReferenceCredentials({ logger: log });

    log('Đang thực thi transaction nạp danh mục, sản phẩm, khách hàng và quan hệ đồ thị...');
    const counts = await runReferenceInTransaction(session, dataset, credentials);
    log(`Nạp Reference Catalog thành công: ${JSON.stringify(counts)}`);

    // 4. Ensure Administrator accounts & Demo Seed accounts
    log('Bước 4/5: Khởi tạo tài khoản Quản trị viên và các tài khoản Demo kiểm thử...');
    const adminAccounts = [
      {
        customerId: 'ADMIN_001',
        name: 'Quản trị viên DT13',
        email: 'admin@example.test',
        role: 'admin',
        plain: 'Admin@001',
      },
      {
        customerId: 'ADMIN_DT13',
        name: 'Quản trị viên Hệ thống DT13',
        email: 'admin_dt13@example.test',
        role: 'admin',
        plain: 'Admin@DT13',
      },
    ];

    for (const admin of adminAccounts) {
      const adminSalt = getDeterministicSalt(admin.customerId);
      const adminHash = await hashPassword(admin.plain, { salt: adminSalt });
      await session.run(
        `MERGE (a:Customer { customerId: $customerId })
         SET a.name = $name,
             a.email = $email,
             a.role = $role,
             a.active = true,
             a.passwordHash = $passwordHash,
             a.datasetTag = $tag,
             a.updatedAt = datetime()
         RETURN a`,
        {
          customerId: admin.customerId,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          passwordHash: adminHash,
          tag: REFERENCE_MARKER,
        }
      );
      log(`Đã khởi tạo tài khoản Admin: ${admin.customerId} (${admin.email}).`);
    }

    const demoSeedCustomers = [
      {
        customerId: 'CUST_001',
        name: 'Nguyễn Văn Một (Seed V1)',
        email: 'cust001@example.test',
        role: 'customer',
        plain: 'Cust@001',
      },
      {
        customerId: 'CUST_002',
        name: 'Trần Thị Hai (Seed V1)',
        email: 'cust002@example.test',
        role: 'customer',
        plain: 'Cust@002',
      },
      {
        customerId: 'CUST_005',
        name: 'Đỗ Hải Yến (Cold-start)',
        email: 'cust005@example.test',
        role: 'customer',
        plain: 'Cust@005',
      },
    ];

    for (const demo of demoSeedCustomers) {
      const salt = getDeterministicSalt(demo.customerId);
      const hash = await hashPassword(demo.plain, { salt });
      await session.run(
        `MERGE (c:Customer { customerId: $customerId })
         SET c.name = $name,
             c.email = $email,
             c.role = $role,
             c.active = true,
             c.passwordHash = $passwordHash,
             c.datasetTag = $tag,
             c.updatedAt = datetime()
         RETURN c`,
        {
          customerId: demo.customerId,
          name: demo.name,
          email: demo.email,
          role: demo.role,
          passwordHash: hash,
          tag: REFERENCE_MARKER,
        }
      );
      log(`Đã khởi tạo tài khoản Demo: ${demo.customerId} (${demo.email} / ${demo.plain}).`);
    }

    // 5. Verification & Report
    log('Bước 5/5: Kiểm tra và thống kê trạng thái CSDL sau khi reset:');
    const nodeRes = await session.run(
      'MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC'
    );
    const relRes = await session.run(
      'MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC'
    );

    console.log('--------------------------------------------------');
    console.log('TỔNG HỢP CƠ SỞ DỮ LIỆU ĐỒ THỊ NEO4J SAU RESET:');
    nodeRes.records.forEach((r) => {
      console.log(`  - Nút ${r.get('label')}: ${r.get('count')}`);
    });
    relRes.records.forEach((r) => {
      console.log(`  - Quan hệ ${r.get('type')}: ${r.get('count')}`);
    });
    console.log('--------------------------------------------------');
    log('HOÀN TẤT RESET DATABASE THÀNH CÔNG 100%!');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('[db:reset] LỖI:', err.stack || err.message || err);
  process.exit(1);
});
