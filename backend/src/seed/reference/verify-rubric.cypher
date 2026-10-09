// Counts across the whole database. Behavior edges exclude BELONGS_TO.
CALL { MATCH (p:Product) RETURN count(p) AS products }
CALL { MATCH (c:Customer) WHERE c.role = 'customer' RETURN count(c) AS customers }
CALL { MATCH (:Customer)-[r:BOUGHT]->(:Product) RETURN count(r) AS bought }
CALL { MATCH (:Customer)-[r:VIEWED]->(:Product) RETURN count(r) AS viewed }
RETURN products, customers, bought, viewed, bought + viewed AS behaviorEdges,
       products >= 100 AND customers >= 50 AND bought + viewed > 300 AS meetsMinimum;

// Reference catalog scope. Stamping a node never overwrites an existing datasetTag.
CALL {
  MATCH (p:Product)
  WHERE 'CATALOG_REAL_120_V1' IN coalesce(p.referenceCatalogTags, [])
  RETURN count(p) AS products
}
CALL {
  MATCH (c:Customer)
  WHERE c.role = 'customer'
    AND 'CATALOG_REAL_120_V1' IN coalesce(c.referenceCatalogTags, [])
  RETURN count(c) AS customers
}
CALL {
  MATCH (:Customer)-[r:BOUGHT]->(:Product)
  WHERE r.datasetTag = 'CATALOG_REAL_120_V1'
  RETURN count(r) AS bought
}
CALL {
  MATCH (:Customer)-[r:VIEWED]->(:Product)
  WHERE r.datasetTag = 'CATALOG_REAL_120_V1'
  RETURN count(r) AS viewed
}
RETURN products, customers, bought, viewed, bought + viewed AS behaviorEdges,
       products = 120 AND customers = 60 AND bought = 372 AND viewed = 360 AS referenceCountsMatch;

// Duplicate BOUGHT events stay as separate rows; the distinct (customer, product) pair count is the one that matters.
MATCH (c:Customer)-[r:BOUGHT]->(p:Product)
WHERE r.datasetTag = 'CATALOG_REAL_120_V1'
RETURN count(r) AS boughtEvents,
       count(DISTINCT [c.customerId, p.productId]) AS distinctBoughtPairs;

// Surfaces duplicate names so metadata can be fixed manually — never deletes nodes.
MATCH (p:Product)
WITH toLower(trim(p.name)) AS name, collect(p.productId) AS ids
WHERE size(ids) > 1
RETURN name, ids ORDER BY size(ids) DESC, name;
