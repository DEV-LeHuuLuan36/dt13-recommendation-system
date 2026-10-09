/**
 * Tap cac truy van Cypher can dung cho Giai doan 2:
 *  - login: lookup customer theo email
 *  - logout/me: truy van lai customer theo customerId de refresh role/active
 *  - graph-stats: dem so luong cho admin
 *  - db-schema: tao constraint
 *  - db-seed: MERGE ON CREATE cho dataset
 *  - db-verify: cac truy van COUNT kiem tra
 *
 * Moi truy van la tham so hoa, khong noi chuoi input truc tiep.
 */

export const CONSTRAINTS = [
  // Customer
  'CREATE CONSTRAINT customer_customerId_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.customerId IS UNIQUE',
  'CREATE CONSTRAINT customer_email_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.email IS UNIQUE',
  // Product
  'CREATE CONSTRAINT product_productId_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.productId IS UNIQUE',
  // Category
  'CREATE CONSTRAINT category_categoryId_unique IF NOT EXISTS FOR (cat:Category) REQUIRE cat.categoryId IS UNIQUE',
  // Relationship uniqueness cho eventId (se tao relationship property existence + backing index)
  'CREATE CONSTRAINT bought_eventId_unique IF NOT EXISTS FOR ()-[r:BOUGHT]-() REQUIRE r.eventId IS UNIQUE',
  'CREATE CONSTRAINT viewed_eventId_unique IF NOT EXISTS FOR ()-[r:VIEWED]-() REQUIRE r.eventId IS UNIQUE',
];

export const QUERIES = {
  // Lookup customer by email (login)
  findCustomerByEmail: `
    MATCH (c:Customer { email: $email })
    RETURN c
    LIMIT 1
  `,

  // Lookup customer by customerId (auth/me + regenerate session)
  findCustomerById: `
    MATCH (c:Customer { customerId: $customerId })
    RETURN c
    LIMIT 1
  `,

  // Dem so luong cho graph-stats (admin)
  graphStats: `
    CALL {
      MATCH (c:Customer) RETURN count(*) AS customerNodes
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'customer' RETURN count(*) AS customerRoleNodes
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'admin' RETURN count(*) AS adminRoleNodes
    }
    CALL {
      MATCH (p:Product) RETURN count(*) AS productNodes
    }
    CALL {
      MATCH (cat:Category) RETURN count(*) AS categoryNodes
    }
    CALL {
      MATCH ()-[r:BOUGHT]->() RETURN count(*) AS boughtEdges
    }
    CALL {
      MATCH ()-[r:VIEWED]->() RETURN count(*) AS viewedEdges
    }
    CALL {
      MATCH ()-[r:BELONGS_TO]->() RETURN count(*) AS belongsToEdges
    }
    RETURN
      customerNodes, customerRoleNodes, adminRoleNodes,
      productNodes, categoryNodes,
      boughtEdges, viewedEdges, belongsToEdges
  `,

  // ----- Recommendations (Phase 4) -----

  /**
   * CF ca nhan (user_cf): goi y san pham dua tren B(u) cua khach dang nhap,
   * tinh score = sum(sharedCount) va support = count(buyer phan biet).
   * Loai san pham u da mua va hang inactive; peer admin / inactive khong dong gop.
   * $limit la integer (neo4j.int).
   */
  recommendForMe: `
    MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
    MATCH (c1)-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)
    WHERE c2 <> c1 AND c2.role = 'customer' AND c2.active = true
    WITH c1, c2, count(DISTINCT p1) AS sharedCount
    MATCH (c2)-[:BOUGHT]->(p2:Product)
    WHERE p2.active = true
      AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(p2) }
    WITH DISTINCT p2, c2, sharedCount
    WITH p2, sum(sharedCount) AS score, count(DISTINCT c2) AS support
    RETURN p2.productId AS productId,
           p2.name      AS name,
           p2.price     AS price,
           p2.imageUrl  AS imageUrl,
           score, support
    ORDER BY score DESC, support DESC, productId ASC
    LIMIT $limit
  `,

  /**
   * Co-bought (mua cung product dang xem): khoi dau tu Product nguon (active),
   * di qua cac buyer phan biet da mua nguon va ghi nhan cac san pham khac ho mua.
   * Khong yeu cau khach hien tai da mua nguon. Loai nguon, hang c1 da mua,
   * peer admin/inactive va ung vien inactive. score = support (so buyer phan biet).
   * $limit la integer (neo4j.int).
   */
  recommendForProduct: `
    MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
    MATCH (source:Product { productId: $productId, active: true })
    MATCH (source)<-[:BOUGHT]-(buyer:Customer)-[:BOUGHT]->(candidate:Product)
    WHERE buyer <> c1
      AND buyer.role = 'customer'
      AND buyer.active = true
      AND candidate <> source
      AND candidate.active = true
      AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(candidate) }
    WITH candidate, count(DISTINCT buyer) AS support
    RETURN candidate.productId AS productId,
           candidate.name      AS name,
           candidate.price     AS price,
           candidate.imageUrl  AS imageUrl,
           support AS score,
           support
    ORDER BY score DESC, support DESC, productId ASC
    LIMIT $limit
  `,

  /**
   * Kiem tra nguon (source) ton tai/active truoc khi goi y.
   * Tra ve productId + active (dung de route tra 404 neu can).
   */
  findSourceProduct: `
    MATCH (p:Product { productId: $productId })
    RETURN p.productId AS productId, p.active AS active, p.datasetTag AS datasetTag
    LIMIT 1
  `,

  /**
   * Kiem tra target customer ton tai va con active (Phase 5: chi de minh hoa graph).
   * Tra customerId + role + active de route co the tra 400/404 neu can.
   */
  findTargetCustomer: `
    MATCH (c:Customer { customerId: $customerId })
    RETURN c.customerId AS customerId, c.role AS role, c.active AS active
    LIMIT 1
  `,

  /**
   * Lay peer list toi da (maxPeers) theo sharedCount (B) cho Phase 5.
   * Moi peer duy nhat mot dong kem sharedCount, nhung peer co sharedCount > 0.
   * Cung role=customer, active=true va khac u.
   */
  cfPeers: `
    MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
    MATCH (c1)-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)
    WHERE c2 <> c1 AND c2.role = 'customer' AND c2.active = true
    WITH c1, c2, count(DISTINCT p1) AS sharedCount
    WITH c2, sharedCount
    ORDER BY sharedCount DESC, c2.customerId ASC
    LIMIT toInteger($maxPeers)
    RETURN c2.customerId AS customerId, sharedCount
  `,

  /**
   * Lay productIds ma peer v va target c1 cung mua (B(u) ∩ B(v)).
   * Dung cho Phase 5 contribute table.
   */
  cfSharedProducts: `
    MATCH (c1:Customer { customerId: $customerId })-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer { customerId: $peerId })
    WHERE c1.role = 'customer' AND c2.role = 'customer' AND c1.active = true AND c2.active = true
    RETURN DISTINCT p1.productId AS productId
  `,

  /**
   * Lay peer candidates (BOUGHT cua peer) tru p in B(u) va p == source.
   * Phase 5: do thi minh hoa, gioi han theo topK peers va limit max.
   */
  cfPeerCandidates: `
    MATCH (c1:Customer { customerId: $customerId })-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)
    WHERE c1.role = 'customer' AND c1.active = true
      AND c2 <> c1 AND c2.role = 'customer' AND c2.active = true
    WITH c1, c2, count(DISTINCT p1) AS sharedCount
    MATCH (c2)-[:BOUGHT]->(p2:Product)
    WHERE p2.active = true
      AND p2 <> $sourceName    /* chi placeholder, query co_bought xu ly rieng */
    WITH DISTINCT p2, c2, sharedCount
    RETURN p2.productId AS productId, c2.customerId AS peerId, sharedCount
    LIMIT toInteger($maxRows)
  `,

  /**
   * Lay peer cho co_bought: cac buyer phan biet role=customer active=true da mua source.
   * Phase 5: do thi minh hoa, co the clip theo $maxK.
   */
  coBoughtBuyers: `
    MATCH (source:Product { productId: $productId, active: true })<-[:BOUGHT]-(buyer:Customer)
    WHERE buyer.role = 'customer' AND buyer.active = true
    RETURN DISTINCT buyer.customerId AS customerId
    LIMIT toInteger($maxK)
  `,

  /**
   * Lay cac candidate ma buyer da mua (tru source va hoa c1).
   * Phase 5: do thi minh hoa.
   */
  coBoughtBuyerCandidates: `
    MATCH (source:Product { productId: $productId, active: true })<-[:BOUGHT]-(buyer:Customer)-[:BOUGHT]->(candidate:Product)
    WHERE buyer.role = 'customer' AND buyer.active = true
      AND candidate <> source
      AND candidate.active = true
    RETURN DISTINCT candidate.productId AS productId, buyer.customerId AS buyerId
    LIMIT toInteger($maxRows)
  `,

  /**
   * Lay product info theo danh sach productIds. Read-only.
   */
  findProductsByIds: `
    MATCH (p:Product)
    WHERE p.productId IN $productIds
    RETURN p.productId AS productId, p.name AS name, p.active AS active,
           p.imageUrl AS imageUrl, p.price AS price
  `,

  /**
   * Lay Category theo productIds qua BELONGS_TO (read-only).
   * Phase 5: do thi minh hoa them category context neu can.
   */
  findCategoriesByProductIds: `
    MATCH (p:Product)-[:BELONGS_TO]->(c:Category)
    WHERE p.productId IN $productIds
    RETURN p.productId AS productId, c.categoryId AS categoryId, c.name AS categoryName
  `,
};

// =========================
// SEED QUERIES
// =========================

export const SEED = {
  // Admin: chi tao Customer neu chua ton tai, gan passwordHash neu chua co.
  // Bao ve passwordHash da ton tai (khong ghi de).
  upsertAdmin: `
    MERGE (c:Customer { customerId: $customerId })
    ON CREATE SET
      c.name = $name,
      c.email = $email,
      c.role = 'admin',
      c.active = true,
      c.createdAt = datetime(),
      c.datasetTag = $marker,
      c.passwordHash = $passwordHash
    ON MATCH SET
      c.datasetTag = $marker
    RETURN c
  `,

  upsertCustomer: `
    MERGE (c:Customer { customerId: $customerId })
    ON CREATE SET
      c.name = $name,
      c.email = $email,
      c.role = 'customer',
      c.active = true,
      c.createdAt = datetime(),
      c.datasetTag = $marker,
      c.passwordHash = $passwordHash
    ON MATCH SET
      c.datasetTag = $marker
    RETURN c
  `,

  upsertCategory: `
    MERGE (cat:Category { categoryId: $categoryId })
    ON CREATE SET
      cat.name = $name,
      cat.description = $description,
      cat.datasetTag = $marker
    ON MATCH SET
      cat.datasetTag = $marker
    RETURN cat
  `,

  upsertProduct: `
    MERGE (p:Product { productId: $productId })
    ON CREATE SET
      p.name = $name,
      p.description = $description,
      p.price = $price,
      p.imageUrl = $imageUrl,
      p.active = true,
      p.createdAt = datetime(),
      p.datasetTag = $marker
    ON MATCH SET
      p.datasetTag = $marker
    RETURN p
  `,

  // Moi Product thuoc 1 Category (BELONGS_TO).
  linkBelongsTo: `
    MATCH (p:Product { productId: $productId })
    MATCH (cat:Category { categoryId: $categoryId })
    OPTIONAL MATCH (p)-[old:BELONGS_TO]->(:Category)
    DELETE old
    MERGE (p)-[b:BELONGS_TO { datasetTag: $marker }]->(cat)
    ON CREATE SET b.createdAt = datetime()
    RETURN p, b, cat
  `,

  // V2: chi set catalogVersion + datasetTag khi MATCH (khong sua name/description/price/imageUrl).
  upsertProductV2: `
    MERGE (p:Product { productId: $productId })
    ON CREATE SET
      p.name = $name,
      p.description = $description,
      p.price = $price,
      p.imageUrl = $imageUrl,
      p.active = true,
      p.createdAt = datetime(),
      p.datasetTag = $marker,
      p.catalogVersion = 'V2'
    ON MATCH SET
      p.datasetTag = COALESCE(p.datasetTag, $marker),
      p.catalogVersion = COALESCE(p.catalogVersion, 'V2')
    RETURN p
  `,

  // V2: customer moi (co persona). Hash password duoc pass vao. KHONG sua customer V1.
  upsertCustomerV2: `
    MERGE (c:Customer { customerId: $customerId })
    ON CREATE SET
      c.name = $name,
      c.email = $email,
      c.passwordHash = $passwordHash,
      c.role = 'customer',
      c.active = true,
      c.createdAt = datetime(),
      c.datasetTag = $marker,
      c.persona = $persona
    RETURN c
  `,

  // V2: admin moi. Khong sua admin V1.
  upsertAdminV2: `
    MERGE (c:Customer { customerId: $customerId })
    ON CREATE SET
      c.name = $name,
      c.email = $email,
      c.passwordHash = $passwordHash,
      c.role = 'admin',
      c.active = true,
      c.createdAt = datetime(),
      c.datasetTag = $marker
    RETURN c
  `,

  // V2: mark inactive (set active=false).
  markInactive: `
    MATCH (c:Customer { customerId: $customerId })
    SET c.active = false,
        c.datasetTag = $marker
    RETURN c
  `,

  // BOUGHT voi MERGE theo eventId de dam bao idempotency.
  linkBought: `
    MERGE (c:Customer { customerId: $customerId })
    MERGE (p:Product { productId: $productId })
    MERGE (c)-[r:BOUGHT { eventId: $eventId }]->(p)
    ON CREATE SET
      r.quantity = $quantity,
      r.unitPrice = $unitPrice,
      r.purchasedAt = datetime($purchasedAt),
      r.datasetTag = $marker
    ON MATCH SET
      r.datasetTag = $marker
    RETURN r
  `,

  linkViewed: `
    MERGE (c:Customer { customerId: $customerId })
    MERGE (p:Product { productId: $productId })
    MERGE (c)-[r:VIEWED { eventId: $eventId }]->(p)
    ON CREATE SET
      r.viewedAt = datetime($viewedAt),
      r.datasetTag = $marker
    ON MATCH SET
      r.datasetTag = $marker
    RETURN r
  `,
};

// =========================
// VERIFY QUERIES (chi doc)
// =========================

export const VERIFY = {
  counts: `
    CALL {
      MATCH (c:Customer) RETURN count(*) AS customerNodes
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'customer' RETURN count(*) AS customerRoleNodes
    }
    CALL {
      MATCH (c:Customer) WHERE c.role = 'admin' RETURN count(*) AS adminRoleNodes
    }
    CALL {
      MATCH (p:Product) RETURN count(*) AS productNodes
    }
    CALL {
      MATCH (cat:Category) RETURN count(*) AS categoryNodes
    }
    CALL {
      MATCH ()-[r:BOUGHT]->() RETURN count(*) AS boughtEdges
    }
    CALL {
      MATCH ()-[r:VIEWED]->() RETURN count(*) AS viewedEdges
    }
    CALL {
      MATCH ()-[r:BELONGS_TO]->() RETURN count(*) AS belongsToEdges
    }
    RETURN *
  `,

  distinctBoughtPairs: `
    MATCH (c:Customer)-[r:BOUGHT { datasetTag: 'DT13_SEED_V1' }]->(p:Product)
    RETURN count(DISTINCT { customerId: c.customerId, productId: p.productId }) AS distinctPairs
  `,

  fixtureGroup: `
    UNWIND ['CUST_001','CUST_002','CUST_003','CUST_004','CUST_005'] AS cid
    OPTIONAL MATCH (c:Customer { customerId: cid })-[r:BOUGHT]->(p:Product)
    WITH cid, collect(DISTINCT p.productId) AS products
    RETURN cid, products
  `,

  groupABoughtAllows: `
    MATCH (c:Customer)-[r:BOUGHT { datasetTag: 'DT13_SEED_V1' }]->(p:Product)
    WHERE c.customerId IN ['CUST_001','CUST_002','CUST_003','CUST_004']
      AND NOT p.productId IN ['PROD_001','PROD_002','PROD_003','PROD_004']
    RETURN count(*) AS violations
  `,

  customer5NoBought: `
    MATCH (c:Customer { customerId: 'CUST_005' })-[r:BOUGHT { datasetTag: 'DT13_SEED_V1' }]->()
    RETURN count(*) AS edges
  `,

  group6to55NoP1toP4: `
    MATCH (c:Customer)-[r:BOUGHT { datasetTag: 'DT13_SEED_V1' }]->(p:Product)
    WHERE c.customerId STARTS WITH 'CUST_'
      AND size(c.customerId) = 8
      AND toInteger(substring(c.customerId, 5, 3)) >= 6
      AND toInteger(substring(c.customerId, 5, 3)) <= 55
      AND p.productId IN ['PROD_001','PROD_002','PROD_003','PROD_004']
    RETURN count(*) AS violations
  `,

  adminNoBehaviors: `
    MATCH (c:Customer { role: 'admin' })-[r]->()
    RETURN count(*) AS behaviors
  `,

  duplicateBelongsTo: `
    MATCH (p:Product)-[r:BELONGS_TO]->(:Category)
    WITH p, count(r) AS rels
    WHERE rels > 1
    RETURN count(p) AS productsWithDup
  `,

  missingFields: `
    MATCH (c:Customer)
    WHERE c.customerId IS NULL OR c.email IS NULL OR c.role IS NULL OR c.active IS NULL
    RETURN count(*) AS countMissing
  `,

  boughtEventIdMissing: `
    MATCH ()-[r:BOUGHT]->()
    WHERE r.eventId IS NULL
    RETURN count(*) AS missing
  `,

  viewedEventIdMissing: `
    MATCH ()-[r:VIEWED]->()
    WHERE r.eventId IS NULL
    RETURN count(*) AS missing
  `,

  boughtTimeMissing: `
    MATCH ()-[r:BOUGHT]->()
    WHERE r.purchasedAt IS NULL
    RETURN count(*) AS missing
  `,

  viewedTimeMissing: `
    MATCH ()-[r:VIEWED]->()
    WHERE r.viewedAt IS NULL
    RETURN count(*) AS missing
  `,

  adminNoBehaviorsDetail: `
    MATCH (c:Customer { role: 'admin' })-[r]->()
    RETURN c.customerId AS cid, type(r) AS type, count(r) AS behaviors
  `,

  showConstraints: `SHOW CONSTRAINTS`,
};

// =========================
// CRUD QUERIES (Phase 3)
// =========================

/**
 * Dinh dang thoi gian tra ve tu Neo4j se duoc map sang ISO string qua mappers.
 *
 * Cac truy van duoi day su dung tham so hoa hoan toan, khong noi input truc tiep
 * vao Cypher.
 */
export const CRUD = {
  // ----- Product -----

  /** Liet ke Product theo filter (q, categoryId) va phan trang. activeFilter:
   *  - 'active' (default): chi active=true
   *  - 'all': ca active va inactive (chi admin goi)
   */
  listProducts: `
    MATCH (p:Product)
    OPTIONAL MATCH (p)-[b:BELONGS_TO]->(c:Category)
    WITH p, c,
      CASE WHEN $q IS NULL OR $q = '' THEN true
           ELSE toLower(p.name) CONTAINS toLower($q) OR toLower(coalesce(p.description, '')) CONTAINS toLower($q)
      END AS matchesQ,
      CASE WHEN $categoryId IS NULL OR $categoryId = '' THEN true
           ELSE c.categoryId = $categoryId
      END AS matchesCat,
      CASE WHEN $activeFilter = 'all' THEN true ELSE coalesce(p.active, true) = true END AS matchesActive
    WHERE matchesQ AND matchesCat AND matchesActive
    WITH p, c
    ORDER BY p.productId ASC
    SKIP toInteger($skip) LIMIT toInteger($limit)
    RETURN p, c
  `,

  countProducts: `
    MATCH (p:Product)
    OPTIONAL MATCH (p)-[b:BELONGS_TO]->(c:Category)
    WITH p, c,
      CASE WHEN $q IS NULL OR $q = '' THEN true
           ELSE toLower(p.name) CONTAINS toLower($q) OR toLower(coalesce(p.description, '')) CONTAINS toLower($q)
      END AS matchesQ,
      CASE WHEN $categoryId IS NULL OR $categoryId = '' THEN true
           ELSE c.categoryId = $categoryId
      END AS matchesCat,
      CASE WHEN $activeFilter = 'all' THEN true ELSE coalesce(p.active, true) = true END AS matchesActive
    WHERE matchesQ AND matchesCat AND matchesActive
    RETURN count(p) AS total
  `,

  getProductById: `
    MATCH (p:Product { productId: $productId })
    OPTIONAL MATCH (p)-[b:BELONGS_TO]->(c:Category)
    RETURN p, c
    LIMIT 1
  `,

  getProductPriceForUpdate: `
    MATCH (p:Product { productId: $productId })
    RETURN p.productId AS productId, p.price AS price, p.active AS active
    LIMIT 1
  `,

  findProductByIdForUpdate: `
    MATCH (p:Product { productId: $productId })
    RETURN p
    LIMIT 1
  `,

  /** Tao Product neu chua ton tai. Tra ve node. */
  createProduct: `
    CREATE (p:Product {
      productId: $productId,
      name: $name,
      description: $description,
      price: $price,
      imageUrl: $imageUrl,
      active: $active,
      createdAt: datetime()
    })
    RETURN p
  `,

  setProductBelongsTo: `
    MATCH (p:Product { productId: $productId })
    MATCH (c:Category { categoryId: $categoryId })
    OPTIONAL MATCH (p)-[old:BELONGS_TO]->(:Category)
    DELETE old
    MERGE (p)-[b:BELONGS_TO]->(c)
    ON CREATE SET b.createdAt = datetime()
    RETURN p, b, c
  `,

  updateProduct: `
    MATCH (p:Product { productId: $productId })
    SET p.name = $name,
        p.description = $description,
        p.price = $price,
        p.imageUrl = $imageUrl,
        p.active = $active
    RETURN p
  `,

  countProductBehaviors: `
    MATCH (p:Product { productId: $productId })
    OPTIONAL MATCH (p)<-[rIn]-(:Customer)
    WITH p, count(rIn) AS inbound
    RETURN inbound
  `,

  deleteProductNoHistory: `
    MATCH (p:Product { productId: $productId })
    OPTIONAL MATCH (p)-[b:BELONGS_TO]->(:Category)
    OPTIONAL MATCH (p)<-[r]-(:Customer)
    WITH p, b, collect(r) AS rs
    FOREACH (_ IN CASE WHEN b IS NULL THEN [] ELSE [1] END | DELETE b)
    WITH p, rs
    DELETE p
    RETURN count(p) AS deleted
  `,

  // ----- Category -----

  listCategories: `
    MATCH (c:Category)
    OPTIONAL MATCH (p:Product)-[:BELONGS_TO]->(c)
    WITH c, count(p) AS productCount
    ORDER BY c.categoryId ASC
    RETURN c, productCount
  `,

  getCategoryById: `
    MATCH (c:Category { categoryId: $categoryId })
    RETURN c
    LIMIT 1
  `,

  getCategoryWithProductCount: `
    MATCH (c:Category { categoryId: $categoryId })
    OPTIONAL MATCH (p:Product)-[:BELONGS_TO]->(c)
    WITH c, count(p) AS productCount
    RETURN c, productCount
  `,

  createCategory: `
    CREATE (c:Category {
      categoryId: $categoryId,
      name: $name,
      description: $description
    })
    RETURN c
  `,

  updateCategory: `
    MATCH (c:Category { categoryId: $categoryId })
    SET c.name = $name,
        c.description = $description
    RETURN c
  `,

  countCategoryProducts: `
    MATCH (c:Category { categoryId: $categoryId })
    OPTIONAL MATCH (p:Product)-[:BELONGS_TO]->(c)
    WITH c, count(p) AS productCount
    RETURN c, productCount
  `,

  deleteCategoryEmpty: `
    MATCH (c:Category { categoryId: $categoryId })
    OPTIONAL MATCH (p:Product)-[:BELONGS_TO]->(c)
    WITH c, count(p) AS productCount
    FOREACH (_ IN CASE WHEN productCount = 0 THEN [1] ELSE [] END | DELETE c)
    RETURN productCount
  `,

  // ----- Customer (admin) -----

  listCustomers: `
    MATCH (c:Customer)
    WHERE c.role = 'customer'
      AND ($q IS NULL OR $q = ''
           OR toLower(c.name) CONTAINS toLower($q)
           OR toLower(c.email) CONTAINS toLower($q))
    WITH c
    ORDER BY c.customerId ASC
    SKIP toInteger($skip) LIMIT toInteger($limit)
    RETURN c
  `,

  countCustomers: `
    MATCH (c:Customer)
    WHERE c.role = 'customer'
      AND ($q IS NULL OR $q = ''
           OR toLower(c.name) CONTAINS toLower($q)
           OR toLower(c.email) CONTAINS toLower($q))
    RETURN count(c) AS total
  `,

  getCustomerByIdAdmin: `
    MATCH (c:Customer { customerId: $customerId })
    RETURN c
    LIMIT 1
  `,

  countCustomerBehaviors: `
    MATCH (c:Customer { customerId: $customerId })
    OPTIONAL MATCH (c)-[r]->(:Product)
    WITH c, count(r) AS behaviors
    RETURN c, behaviors
  `,

  createCustomer: `
    CREATE (c:Customer {
      customerId: $customerId,
      name: $name,
      email: $email,
      passwordHash: $passwordHash,
      role: 'customer',
      active: $active,
      createdAt: datetime()
    })
    RETURN c
  `,

  updateCustomer: `
    MATCH (c:Customer { customerId: $customerId })
    SET c.name = $name,
        c.email = $email,
        c.active = $active
    RETURN c
  `,

  deleteCustomerNoHistory: `
    MATCH (c:Customer { customerId: $customerId })
    WHERE c.role = 'customer'
    OPTIONAL MATCH (c)-[r]->(:Product)
    WITH c, collect(r) AS rs
    FOREACH (_ IN CASE WHEN size(rs) = 0 THEN [1] ELSE [] END | DELETE c)
    RETURN c
  `,

  /**
   * Dem behaviors theo tung loai de phan biet 404 (khong co khach) va 409 (co lich su).
   * Tra ve: customer, bought, viewed (moi loai la count).
   */
  customerBehaviorBreakdown: `
    MATCH (c:Customer { customerId: $customerId })
    OPTIONAL MATCH (c)-[b:BOUGHT]->(:Product)
    WITH c, count(b) AS bought
    OPTIONAL MATCH (c)-[v:VIEWED]->(:Product)
    RETURN c, bought, count(v) AS viewed
  `,

  // ----- Interactions -----

  /**
   * Lookup BOUGHT theo eventId. Tra ve: edge, customerId, productId, quantity, unitPrice, purchasedAt.
   * Neu khong co -> 0 records.
   */
  findBoughtByEventId: `
    MATCH (c:Customer)-[r:BOUGHT { eventId: $eventId }]->(p:Product)
    RETURN c.customerId AS customerId, p.productId AS productId, r AS r
    LIMIT 1
  `,

  findViewedByEventId: `
    MATCH (c:Customer)-[r:VIEWED { eventId: $eventId }]->(p:Product)
    RETURN c.customerId AS customerId, p.productId AS productId, r AS r
    LIMIT 1
  `,

  /** Lay gia va trang thai cua Product kem role/active cua Customer trong 1 truy van (kiem tra trong transaction). */
  fetchCustomerAndProductForInteraction: `
    MATCH (c:Customer { customerId: $customerId })
    OPTIONAL MATCH (c)-[oldB:BOUGHT { eventId: $eventId }]->(pB:Product)
    WITH c, collect({ b: oldB, p: pB }) AS existingBought
    OPTIONAL MATCH (c)-[oldV:VIEWED { eventId: $eventId }]->(pV:Product)
    WITH c, existingBought, collect({ v: oldV, p: pV }) AS existingViewed
    RETURN c, existingBought, existingViewed
  `,

  /** Ghi BOUGHT moi. Dam bao eventId duoc truyen vao. */
  createBought: `
    MATCH (c:Customer { customerId: $customerId })
    MATCH (p:Product { productId: $productId })
    MERGE (c)-[r:BOUGHT { eventId: $eventId }]->(p)
    ON CREATE SET
      r.quantity = $quantity,
      r.unitPrice = $unitPrice,
      r.purchasedAt = datetime()
    RETURN r, c.customerId AS customerId, p.productId AS productId
  `,

  /** Ghi VIEWED moi. */
  createViewed: `
    MATCH (c:Customer { customerId: $customerId })
    MATCH (p:Product { productId: $productId })
    MERGE (c)-[r:VIEWED { eventId: $eventId }]->(p)
    ON CREATE SET
      r.viewedAt = datetime()
    RETURN r, c.customerId AS customerId, p.productId AS productId
  `,

  // ----- History -----

  /** Liet ke BOUGHT cua customer, kem thong tin Product (ke ca Product inactive). */
  listBoughtHistory: `
    MATCH (c:Customer { customerId: $customerId })-[r:BOUGHT]->(p:Product)
    WITH c, r, p
    ORDER BY r.purchasedAt DESC, r.eventId ASC
    SKIP toInteger($skip) LIMIT toInteger($limit)
    RETURN r, p
  `,

  countBoughtHistory: `
    MATCH (c:Customer { customerId: $customerId })-[r:BOUGHT]->(:Product)
    RETURN count(r) AS total
  `,

  listViewedHistory: `
    MATCH (c:Customer { customerId: $customerId })-[r:VIEWED]->(p:Product)
    WITH c, r, p
    ORDER BY r.viewedAt DESC, r.eventId ASC
    SKIP toInteger($skip) LIMIT toInteger($limit)
    RETURN r, p
  `,

  countViewedHistory: `
    MATCH (c:Customer { customerId: $customerId })-[r:VIEWED]->(:Product)
    RETURN count(r) AS total
  `,

  // ----- Verify / dataset -----

  /**
   * Phan biet count seed (datasetTag = 'DT13_SEED_V1') va total graph.
   * Tra ve: seedBought, seedViewed, seedProduct, seedCustomer, seedCategory, seedBelongsTo,
   *         totalBought, totalViewed, totalProduct, totalCustomer, totalCategory, totalBelongsTo.
   */
  countByDatasetTag: `
    CALL {
      MATCH ()-[r:BOUGHT { datasetTag: 'DT13_SEED_V1' }]->()
      RETURN count(r) AS seedBought
    }
    CALL {
      MATCH ()-[r:VIEWED { datasetTag: 'DT13_SEED_V1' }]->()
      RETURN count(r) AS seedViewed
    }
    CALL {
      MATCH (p:Product { datasetTag: 'DT13_SEED_V1' })
      RETURN count(p) AS seedProduct
    }
    CALL {
      MATCH (c:Customer { datasetTag: 'DT13_SEED_V1' })
      RETURN count(c) AS seedCustomer
    }
    CALL {
      MATCH (c:Category { datasetTag: 'DT13_SEED_V1' })
      RETURN count(c) AS seedCategory
    }
    CALL {
      MATCH ()-[r:BELONGS_TO { datasetTag: 'DT13_SEED_V1' }]->()
      RETURN count(r) AS seedBelongsTo
    }
    CALL {
      MATCH ()-[r:BOUGHT]->()
      RETURN count(r) AS totalBought
    }
    CALL {
      MATCH ()-[r:VIEWED]->()
      RETURN count(r) AS totalViewed
    }
    CALL {
      MATCH (p:Product)
      RETURN count(p) AS totalProduct
    }
    CALL {
      MATCH (c:Customer)
      RETURN count(c) AS totalCustomer
    }
    CALL {
      MATCH (c:Category)
      RETURN count(c) AS totalCategory
    }
    CALL {
      MATCH ()-[r:BELONGS_TO]->()
      RETURN count(r) AS totalBelongsTo
    }
    RETURN
      seedBought, seedViewed, seedProduct, seedCustomer, seedCategory, seedBelongsTo,
      totalBought, totalViewed, totalProduct, totalCustomer, totalCategory, totalBelongsTo
  `,
};
