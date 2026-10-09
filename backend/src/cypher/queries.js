// All queries are fully parameterized; never concatenate user input into Cypher.

export const CONSTRAINTS = [
  'CREATE CONSTRAINT customer_customerId_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.customerId IS UNIQUE',
  'CREATE CONSTRAINT customer_email_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.email IS UNIQUE',
  'CREATE CONSTRAINT product_productId_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.productId IS UNIQUE',
  'CREATE CONSTRAINT category_categoryId_unique IF NOT EXISTS FOR (cat:Category) REQUIRE cat.categoryId IS UNIQUE',
  'CREATE CONSTRAINT bought_eventId_unique IF NOT EXISTS FOR ()-[r:BOUGHT]-() REQUIRE r.eventId IS UNIQUE',
  'CREATE CONSTRAINT viewed_eventId_unique IF NOT EXISTS FOR ()-[r:VIEWED]-() REQUIRE r.eventId IS UNIQUE',
];

export const QUERIES = {
  // Login: lookup customer by email.
  findCustomerByEmail: `
    MATCH (c:Customer { email: $email })
    RETURN c
    LIMIT 1
  `,

  // /me and session refresh: lookup by customerId.
  findCustomerById: `
    MATCH (c:Customer { customerId: $customerId })
    RETURN c
    LIMIT 1
  `,

  // Admin dashboard counts.
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

  // ----- Recommendations -----

  // user_cf: items from peer customers that share a purchase with the target.
  // Excludes items the target already bought, inactive products, and admin/inactive peers.
  // score = sum(sharedCount), support = count(distinct peer).
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

  // co_bought: other items bought by customers who also bought `source`.
  // The target does not need to have bought source. Excludes source, items the
  // target already bought, and admin/inactive buyers/inactive candidates.
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

  // Source lookup for co_bought: existence + active flag.
  findSourceProduct: `
    MATCH (p:Product { productId: $productId })
    RETURN p.productId AS productId, p.active AS active, p.datasetTag AS datasetTag
    LIMIT 1
  `,

  // Target customer lookup for the analytics graph endpoint.
  findTargetCustomer: `
    MATCH (c:Customer { customerId: $customerId })
    RETURN c.customerId AS customerId, c.role AS role, c.active AS active
    LIMIT 1
  `,

  // Top peers by sharedCount for the graph endpoint.
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

  // Items both the target and a peer bought (B(u) ∩ B(v)).
  cfSharedProducts: `
    MATCH (c1:Customer { customerId: $customerId })-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer { customerId: $peerId })
    WHERE c1.role = 'customer' AND c2.role = 'customer' AND c1.active = true AND c2.active = true
    RETURN DISTINCT p1.productId AS productId
  `,

  // Peer candidates for the graph: peer → candidate with their sharedCount.
  cfPeerCandidates: `
    MATCH (c1:Customer { customerId: $customerId })-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)
    WHERE c1.role = 'customer' AND c1.active = true
      AND c2 <> c1 AND c2.role = 'customer' AND c2.active = true
    WITH c1, c2, count(DISTINCT p1) AS sharedCount
    MATCH (c2)-[:BOUGHT]->(p2:Product)
    WHERE p2.active = true
      AND p2 <> $sourceName
    WITH DISTINCT p2, c2, sharedCount
    RETURN p2.productId AS productId, c2.customerId AS peerId, sharedCount
    LIMIT toInteger($maxRows)
  `,

  // Distinct buyers of the source product (for co_bought graph).
  coBoughtBuyers: `
    MATCH (source:Product { productId: $productId, active: true })<-[:BOUGHT]-(buyer:Customer)
    WHERE buyer.role = 'customer' AND buyer.active = true
    RETURN DISTINCT buyer.customerId AS customerId
    LIMIT toInteger($maxK)
  `,

  // Candidates purchased by buyers of the source (excluding source itself).
  coBoughtBuyerCandidates: `
    MATCH (source:Product { productId: $productId, active: true })<-[:BOUGHT]-(buyer:Customer)-[:BOUGHT]->(candidate:Product)
    WHERE buyer.role = 'customer' AND buyer.active = true
      AND candidate <> source
      AND candidate.active = true
    RETURN DISTINCT candidate.productId AS productId, buyer.customerId AS buyerId
    LIMIT toInteger($maxRows)
  `,

  // Read-only product lookup by id.
  findProductsByIds: `
    MATCH (p:Product)
    WHERE p.productId IN $productIds
    RETURN p.productId AS productId, p.name AS name, p.active AS active,
           p.imageUrl AS imageUrl, p.price AS price
  `,

  // Read-only category lookup for the listed product ids.
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
  // Upsert admin; preserves any existing passwordHash on MATCH.
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

  // Each Product belongs to exactly one Category. Replace any previous BELONGS_TO.
  linkBelongsTo: `
    MATCH (p:Product { productId: $productId })
    MATCH (cat:Category { categoryId: $categoryId })
    OPTIONAL MATCH (p)-[old:BELONGS_TO]->(:Category)
    DELETE old
    MERGE (p)-[b:BELONGS_TO { datasetTag: $marker }]->(cat)
    ON CREATE SET b.createdAt = datetime()
    RETURN p, b, cat
  `,

  // V2 upsert: only stamps catalogVersion + datasetTag on MATCH (never overwrites name/description/price/imageUrl).
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

  // V2 customer with persona; never mutates an existing V1 customer.
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

  // V2 admin upsert; never mutates an existing V1 admin.
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

  markInactive: `
    MATCH (c:Customer { customerId: $customerId })
    SET c.active = false,
        c.datasetTag = $marker
    RETURN c
  `,

  // Idempotent via eventId; ON CREATE writes the interaction payload, ON MATCH only refreshes the datasetTag.
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
// VERIFY QUERIES (read-only)
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
// CRUD QUERIES
// =========================

export const CRUD = {
  // ----- Product -----

  // Filtered product list. $q is already Vietnamese-diacritic-stripped by the
  // client. $activeFilter is 'active' (default) or 'all' (admin only).
  // $brand matches case-insensitively. $priceMin/$priceMax are integer VND.
  // $sort picks one of: price_asc, price_desc, name_asc, name_desc, newest, relevance.
  // productId ASC is the tie-breaker so pagination is stable.
  listProducts: `
    MATCH (p:Product)
    OPTIONAL MATCH (p)-[b:BELONGS_TO]->(c:Category)
    WITH p, c,
      CASE WHEN $q IS NULL OR $q = '' THEN true
           ELSE toLower(p.name) CONTAINS toLower($q)
             OR toLower(coalesce(p.brand, '')) CONTAINS toLower($q)
             OR toLower(coalesce(p.model, '')) CONTAINS toLower($q)
             OR toLower(coalesce(p.description, '')) CONTAINS toLower($q)
             OR toLower(coalesce(p.searchText, '')) CONTAINS toLower($q)
      END AS matchesQ,
      CASE WHEN $categoryId IS NULL OR $categoryId = '' THEN true
           ELSE c.categoryId = $categoryId
      END AS matchesCat,
      CASE WHEN $activeFilter = 'all' THEN true ELSE coalesce(p.active, true) = true END AS matchesActive,
      CASE WHEN $brand IS NULL OR $brand = '' THEN true
           ELSE toLower(coalesce(p.brand, '')) = toLower($brand)
      END AS matchesBrand,
      CASE WHEN $priceMin IS NULL THEN true ELSE coalesce(p.price, 0) >= toInteger($priceMin) END AS matchesPriceMin,
      CASE WHEN $priceMax IS NULL THEN true ELSE coalesce(p.price, 0) <= toInteger($priceMax) END AS matchesPriceMax
    WHERE matchesQ AND matchesCat AND matchesActive AND matchesBrand AND matchesPriceMin AND matchesPriceMax
    WITH p, c
    ORDER BY
      CASE WHEN $sort = 'price_asc'  THEN p.price END ASC,
      CASE WHEN $sort = 'price_desc' THEN p.price END DESC,
      CASE WHEN $sort = 'name_asc'   THEN p.name  END ASC,
      CASE WHEN $sort = 'name_desc'  THEN p.name  END DESC,
      CASE WHEN $sort = 'newest'     THEN p.createdAt END DESC,
      p.productId ASC
    SKIP toInteger($skip) LIMIT toInteger($limit)
    RETURN p, c
  `,

  countProducts: `
    MATCH (p:Product)
    OPTIONAL MATCH (p)-[b:BELONGS_TO]->(c:Category)
    WITH p, c,
      CASE WHEN $q IS NULL OR $q = '' THEN true
           ELSE toLower(p.name) CONTAINS toLower($q)
             OR toLower(coalesce(p.brand, '')) CONTAINS toLower($q)
             OR toLower(coalesce(p.model, '')) CONTAINS toLower($q)
             OR toLower(coalesce(p.description, '')) CONTAINS toLower($q)
             OR toLower(coalesce(p.searchText, '')) CONTAINS toLower($q)
      END AS matchesQ,
      CASE WHEN $categoryId IS NULL OR $categoryId = '' THEN true
           ELSE c.categoryId = $categoryId
      END AS matchesCat,
      CASE WHEN $activeFilter = 'all' THEN true ELSE coalesce(p.active, true) = true END AS matchesActive,
      CASE WHEN $brand IS NULL OR $brand = '' THEN true
           ELSE toLower(coalesce(p.brand, '')) = toLower($brand)
      END AS matchesBrand,
      CASE WHEN $priceMin IS NULL THEN true ELSE coalesce(p.price, 0) >= toInteger($priceMin) END AS matchesPriceMin,
      CASE WHEN $priceMax IS NULL THEN true ELSE coalesce(p.price, 0) <= toInteger($priceMax) END AS matchesPriceMax
    WHERE matchesQ AND matchesCat AND matchesActive AND matchesBrand AND matchesPriceMin AND matchesPriceMax
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
           OR toLower(c.email) CONTAINS toLower($q)
           OR toLower(c.customerId) CONTAINS toLower($q))
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
           OR toLower(c.email) CONTAINS toLower($q)
           OR toLower(c.customerId) CONTAINS toLower($q))
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

  // Distinguishes 404 (no customer) from 409 (customer with history).
  customerBehaviorBreakdown: `
    MATCH (c:Customer { customerId: $customerId })
    OPTIONAL MATCH (c)-[b:BOUGHT]->(:Product)
    WITH c, count(b) AS bought
    OPTIONAL MATCH (c)-[v:VIEWED]->(:Product)
    RETURN c, bought, count(v) AS viewed
  `,

  // ----- Interactions -----

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

  // Used inside the write transaction to atomically check customer+product state.
  fetchCustomerAndProductForInteraction: `
    MATCH (c:Customer { customerId: $customerId })
    OPTIONAL MATCH (c)-[oldB:BOUGHT { eventId: $eventId }]->(pB:Product)
    WITH c, collect({ b: oldB, p: pB }) AS existingBought
    OPTIONAL MATCH (c)-[oldV:VIEWED { eventId: $eventId }]->(pV:Product)
    WITH c, existingBought, collect({ v: oldV, p: pV }) AS existingViewed
    RETURN c, existingBought, existingViewed
  `,

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

  createViewed: `
    MATCH (c:Customer { customerId: $customerId })
    MATCH (p:Product { productId: $productId })
    MERGE (c)-[r:VIEWED { eventId: $eventId }]->(p)
    ON CREATE SET
      r.viewedAt = datetime()
    RETURN r, c.customerId AS customerId, p.productId AS productId
  `,

  // ----- History -----

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
