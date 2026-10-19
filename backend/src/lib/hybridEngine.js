import neo4j from 'neo4j-driver';
import { normalizeSearchQuery, tokenize } from './vietnamese.js';
import { parseSearchIntent } from './searchIntentParser.js';
import { toNumber } from './mappers.js';
import { EVENTS } from '../cypher/queries.js';

// Configuration constants
export const CONFIG = {
  WEIGHTS: {
    USER_CF: 2.5,
    MULTI_BEHAVIOR: 2.0,
    SEARCH_INTENT_FRESH: 5.0, // Searches within current visit or < 2 hours
    SEARCH_INTENT_OLDER: 1.8,
    CO_BOUGHT: 1.5,
    CROSS_CATEGORY: 1.8, // Cross-category collaborative filtering
    SUBSTITUTE: 1.0,
    FALLBACK: 0.3,
  },
  HALF_LIFE_DAYS: {
    SEARCH: 7.0,
    VIEW: 14.0,
    PURCHASE_PREFERENCE: 60.0,
    IMPRESSION_PENALTY: 14.0,
  },
  TTL_DAYS: {
    SEARCH_RETENTION: 30,
    IMPRESSION_RETENTION: 14,
  },
  REPETITION_PENALTY: 0.25,
};

// Calculate exponential recency decay: 2 ^ (-ageDays / halfLifeDays)
export function calculateDecay(ageDays, halfLifeDays) {
  if (typeof ageDays !== 'number' || ageDays < 0) return 1.0;
  return Math.pow(2, -ageDays / halfLifeDays);
}

// Simple deterministic hash generator (Murmur-like 32-bit integer)
function stringHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Seeded pseudo-random number generator (Mulberry32)
function createSeededRandom(seedInt) {
  let s = seedInt;
  return function nextFloat() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normalizes an array of raw scores to [0, 1]
function normalizeScores(candidates) {
  if (!candidates || candidates.length === 0) return [];
  const max = Math.max(...candidates.map((c) => c.rawScore));
  const min = Math.min(...candidates.map((c) => c.rawScore));
  const range = max - min;
  return candidates.map((c) => ({
    ...c,
    normScore: range > 0.0001 ? (c.rawScore - min) / range : 1.0,
  }));
}

export class HybridEngine {
  constructor(neo4jClient) {
    this.neo4j = neo4jClient;
    this.catalogCache = null;
    this.catalogCacheExpiresAt = 0;
  }

  // Caches active catalog products in memory for fast feature lookups (TTL: 60s)
  async getActiveCatalog() {
    const now = Date.now();
    if (this.catalogCache && now < this.catalogCacheExpiresAt) {
      return this.catalogCache;
    }
    const res = await this.neo4j.read(`
      MATCH (p:Product)
      WHERE p.active = true
      OPTIONAL MATCH (p)-[:BELONGS_TO]->(c:Category)
      RETURN p.productId AS productId,
             p.name AS name,
             p.price AS price,
             p.brand AS brand,
             p.model AS model,
             p.imageUrl AS imageUrl,
             p.description AS description,
             c.categoryId AS categoryId,
             c.name AS categoryName
    `);
    const catalog = (res.records || []).map((r) => {
      const p = {
        productId: r.get('productId'),
        name: r.get('name'),
        price: toNumber(r.get('price')),
        brand: r.get('brand') || '',
        model: r.get('model') || '',
        imageUrl: r.get('imageUrl'),
        description: r.get('description') || '',
        categoryId: r.get('categoryId') || null,
        categoryName: r.get('categoryName') || null,
      };
      p.normText = normalizeSearchQuery(`${p.name} ${p.brand} ${p.model} ${p.categoryName} ${p.description}`);
      return p;
    });
    this.catalogCache = catalog;
    this.catalogCacheExpiresAt = now + 60000;
    return catalog;
  }

  // Fetches interaction history, dismissals, recent searches, views, and impressions for the actor
  async getActorState(actor, feedId = 'home_feed') {
    const isCustomer = actor.type === 'customer';

    // 1. Bought products (to hard-exclude from recommendations)
    let bought = [];
    if (isCustomer) {
      const res = await this.neo4j.read(EVENTS.getPurchasesForCustomer, { customerId: actor.id });
      bought = (res.records || []).map((r) => r.get('productId'));
    }

    // 2. Dismissed products (to hard-exclude)
    const dismissQuery = isCustomer ? EVENTS.getDismissedForCustomer : EVENTS.getDismissedForGuest;
    const dismissParams = isCustomer ? { customerId: actor.id } : { guestId: actor.id };
    const dismissRes = await this.neo4j.read(dismissQuery, dismissParams);
    const dismissed = (dismissRes.records || []).map((r) => r.get('productId'));

    // 3. Recent searches (up to 30 days)
    const searchQuery = isCustomer ? EVENTS.getRecentSearchesForCustomer : EVENTS.getRecentSearchesForGuest;
    const searchRes = await this.neo4j.read(searchQuery, dismissParams);
    const searches = (searchRes.records || []).map((r) => {
      let intent = null;
      const rawIntent = r.get('intentJson');
      if (rawIntent) {
        try { intent = JSON.parse(rawIntent); } catch { /* ignore invalid JSON */ }
      }
      if (!intent) {
        intent = parseSearchIntent(r.get('rawQuery') || r.get('query'));
      }
      return {
        query: r.get('query'),
        rawQuery: r.get('rawQuery'),
        norm: r.get('norm') || normalizeSearchQuery(r.get('query')),
        ageDays: toNumber(r.get('ageDays')) || 0,
        intent,
      };
    });

    const activeSearchIntent = searches.length > 0 && searches[0].ageDays <= 1.0 ? searches[0].intent : null;

    // 4. Recent views (up to 14 days)
    const viewQuery = isCustomer ? EVENTS.getRecentViewsForCustomer : EVENTS.getRecentViewsForGuest;
    const viewRes = await this.neo4j.read(viewQuery, dismissParams);
    const views = (viewRes.records || []).map((r) => ({
      productId: r.get('productId'),
      name: r.get('name'),
      ageDays: toNumber(r.get('ageDays')) || 0,
    }));

    // 5. Recent impressions in this feed (for repetition penalty)
    const impQuery = isCustomer ? EVENTS.getRecentImpressionsForCustomer : EVENTS.getRecentImpressionsForGuest;
    const impParams = isCustomer ? { customerId: actor.id, feedId } : { guestId: actor.id, feedId };
    const impRes = await this.neo4j.read(impQuery, impParams);
    const impressions = (impRes.records || []).map((r) => ({
      productId: r.get('productId'),
      ageDays: toNumber(r.get('ageDays')) || 0,
    }));

    return {
      boughtSet: new Set(bought),
      dismissedSet: new Set(dismissed),
      searches,
      activeSearchIntent,
      views,
      impressions,
    };
  }

  // Source A: User CF Baseline (Customer only)
  async generateSourceA_UserCF(customerId, boughtSet) {
    const res = await this.neo4j.read(`
      MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
      MATCH (c1)-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)
      WHERE c2 <> c1 AND c2.role = 'customer' AND c2.active = true
      WITH c1, c2, count(DISTINCT p1) AS sharedCount
      MATCH (c2)-[:BOUGHT]->(p2:Product)
      WHERE p2.active = true
        AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(p2) }
      WITH DISTINCT p2, c2, sharedCount
      WITH p2, sum(sharedCount) AS score, count(DISTINCT c2) AS support
      RETURN p2.productId AS productId, score, support
    `, { customerId });

    const candidates = [];
    for (const r of res.records || []) {
      const pid = r.get('productId');
      if (boughtSet.has(pid)) continue;
      candidates.push({
        productId: pid,
        rawScore: toNumber(r.get('score')),
        support: toNumber(r.get('support')),
        source: 'user_cf',
        evidence: `CF mua chung (score=${toNumber(r.get('score'))}, support=${toNumber(r.get('support'))})`,
      });
    }
    return normalizeScores(candidates);
  }

  // Source B: Multi-behavior User CF (weighted Jaccard over BOUGHT w=3.0, VIEWED w=1.0)
  async generateSourceB_MultiBehavior(customerId, boughtSet) {
    const res = await this.neo4j.read(`
      MATCH (u:Customer { customerId: $customerId, role: 'customer', active: true })
      MATCH (u)-[ru]->(p:Product)
      WHERE (type(ru) = 'BOUGHT' OR type(ru) = 'VIEWED') AND p.active = true
      WITH u, p, CASE WHEN type(ru) = 'BOUGHT' THEN 3.0 ELSE 1.0 END AS wu
      WITH u, p, max(wu) AS wu_p
      MATCH (v:Customer)-[rv]->(p)
      WHERE v <> u AND v.role = 'customer' AND v.active = true
      WITH u, v, p, wu_p, CASE WHEN type(rv) = 'BOUGHT' THEN 3.0 ELSE 1.0 END AS wv
      WITH u, v, p, wu_p, max(wv) AS wv_p
      WITH u, v,
           sum(CASE WHEN wu_p < wv_p THEN wu_p ELSE wv_p END) AS intersectionSum,
           sum(CASE WHEN wu_p > wv_p THEN wu_p ELSE wv_p END) AS unionSum
      WHERE unionSum > 0
      WITH u, v, (intersectionSum / unionSum) AS jaccardSim
      WHERE jaccardSim > 0.05
      MATCH (v)-[:BOUGHT]->(cand:Product)
      WHERE cand.active = true
        AND NOT EXISTS { MATCH (u)-[:BOUGHT]->(cand) }
      WITH cand, count(DISTINCT v) AS support, sum(jaccardSim * 3.0) AS rawScore
      RETURN cand.productId AS productId, rawScore, support
    `, { customerId });

    const candidates = [];
    for (const r of res.records || []) {
      const pid = r.get('productId');
      if (boughtSet.has(pid)) continue;
      candidates.push({
        productId: pid,
        rawScore: toNumber(r.get('rawScore')),
        support: toNumber(r.get('support')),
        source: 'multibehavior',
        evidence: `Hành vi tương đồng (support=${toNumber(r.get('support'))})`,
      });
    }
    return normalizeScores(candidates);
  }

  // Source C: Search Intent Match (Supports budget filtering & attributes)
  generateSourceC_SearchIntent(catalog, searches, boughtSet) {
    if (!searches || searches.length === 0) return [];
    const candidateMap = new Map();

    for (const s of searches) {
      const intent = s.intent || parseSearchIntent(s.query);
      const queryNorm = intent.normalizedQuery || s.norm;
      const queryTokens = tokenize(queryNorm);
      if (queryTokens.length === 0 && !intent.category) continue;

      const decay = calculateDecay(s.ageDays, CONFIG.HALF_LIFE_DAYS.SEARCH);
      const isFresh = s.ageDays <= 0.1;
      const intentWeight = (isFresh ? CONFIG.WEIGHTS.SEARCH_INTENT_FRESH : CONFIG.WEIGHTS.SEARCH_INTENT_OLDER) * decay;

      const matches = [];
      for (const prod of catalog) {
        if (boughtSet.has(prod.productId)) continue;

        // Hard filters from intent if category matches
        if (intent.category && prod.categoryId === intent.category.id) {
          if (intent.maxPrice !== null) {
            if (intent.inclusiveMax === false && prod.price >= intent.maxPrice) continue;
            if (intent.inclusiveMax === true && prod.price > intent.maxPrice) continue;
          }
          if (intent.minPrice !== null) {
            if (intent.inclusiveMin === false && prod.price <= intent.minPrice) continue;
            if (intent.inclusiveMin === true && prod.price < intent.minPrice) continue;
          }
          if (intent.excludedBrands?.length && intent.excludedBrands.includes(prod.brand)) {
            continue;
          }
        }

        let matchQuality = 0;
        const normModel = normalizeSearchQuery(prod.model || '');
        const normBrand = normalizeSearchQuery(prod.brand || '');
        const normName = normalizeSearchQuery(prod.name || '');

        const normIntentModel = intent.model ? normalizeSearchQuery(intent.model) : '';
        if (normIntentModel && (normModel.includes(normIntentModel) || normName.includes(normIntentModel))) {
          matchQuality = 1.0;
        } else if (normModel && queryNorm.includes(normModel)) {
          matchQuality = 1.0;
        } else if (normName && (normName === queryNorm || normName.includes(queryNorm) || queryNorm.includes(normName))) {
          matchQuality = 1.0;
        } else if (intent.category && prod.categoryId === intent.category.id) {
          matchQuality = 0.75;
          if (queryTokens.length > 0) {
            let hits = 0;
            for (const t of queryTokens) {
              if (prod.normText.includes(t)) hits++;
            }
            matchQuality += (hits / queryTokens.length) * 0.2;
          }
        } else {
          let tokenHits = 0;
          for (const t of queryTokens) {
            if (prod.normText.includes(t)) tokenHits++;
          }
          if (tokenHits === queryTokens.length) {
            matchQuality = normBrand && queryNorm.includes(normBrand) ? 0.85 : 0.7;
          } else if (tokenHits >= Math.ceil(queryTokens.length * 0.6)) {
            matchQuality = 0.45;
          }
        }

        if (matchQuality > 0) {
          matches.push({ product: prod, matchQuality });
        }
      }

      matches.sort((a, b) => b.matchQuality - a.matchQuality || a.product.productId.localeCompare(b.product.productId));
      const topK = matches.slice(0, 20);
      for (let i = 0; i < topK.length; i++) {
        const { product, matchQuality } = topK[i];
        const rankDiscount = 1.0 / (1.0 + i * 0.15);
        const score = matchQuality * intentWeight * rankDiscount;

        const current = candidateMap.get(product.productId) || {
          productId: product.productId,
          rawScore: 0,
          query: s.query,
          source: 'search',
        };
        current.rawScore += score;
        candidateMap.set(product.productId, current);
      }
    }

    const candidates = Array.from(candidateMap.values());
    return normalizeScores(candidates);
  }

  // Source D: Co-bought from recently viewed / purchased products
  async generateSourceD_CoBought(anchorProductIds, boughtSet) {
    if (!anchorProductIds || anchorProductIds.length === 0) return [];
    const res = await this.neo4j.read(`
      UNWIND $anchorIds AS anchorId
      MATCH (p:Product { productId: anchorId, active: true })<-[:BOUGHT]-(b:Customer)-[:BOUGHT]->(cand:Product)
      WHERE b.role = 'customer' AND b.active = true
        AND cand <> p AND cand.active = true
      WITH cand, count(DISTINCT b) AS buyers
      RETURN cand.productId AS productId, buyers AS rawScore
      ORDER BY rawScore DESC
      LIMIT 15
    `, { anchorIds: anchorProductIds });

    const candidates = [];
    for (const r of res.records || []) {
      const pid = r.get('productId');
      if (boughtSet.has(pid)) continue;
      candidates.push({
        productId: pid,
        rawScore: toNumber(r.get('rawScore')),
        source: 'co_bought',
        evidence: `Khách mua cùng (${toNumber(r.get('rawScore'))} người)`,
      });
    }
    return normalizeScores(candidates);
  }

  // Source G: Cross-Category Collaborative Filtering
  async generateSourceCrossCategory(anchorProductIds, boughtSet) {
    if (!anchorProductIds || anchorProductIds.length === 0) return [];
    const res = await this.neo4j.read(`
      UNWIND $anchorIds AS anchorId
      MATCH (anchor:Product { productId: anchorId, active: true })-[:BELONGS_TO]->(sourceCat:Category)
      MATCH (peer:Customer { role: 'customer', active: true })-[:BOUGHT]->(anchor)
      MATCH (peer)-[:BOUGHT]->(cand:Product)-[:BELONGS_TO]->(targetCat:Category)
      WHERE cand.active = true AND cand <> anchor
        AND targetCat <> sourceCat
      WITH cand, targetCat, sourceCat, count(DISTINCT peer) AS distinctPeers
      WHERE distinctPeers > 0
      // Dampen small support with heuristic: support / (support + 2)
      WITH cand, targetCat, distinctPeers, (toFloat(distinctPeers) / (toFloat(distinctPeers) + 2.0)) AS confidence
      RETURN cand.productId AS productId,
             cand.name AS name,
             cand.price AS price,
             cand.imageUrl AS imageUrl,
             cand.brand AS brand,
             targetCat.name AS categoryName,
             targetCat.categoryId AS categoryId,
             distinctPeers AS support,
             (distinctPeers * confidence) AS rawScore
      ORDER BY rawScore DESC, distinctPeers DESC, cand.productId ASC
      LIMIT 15
    `, { anchorIds: anchorProductIds });

    const candidates = [];
    for (const r of res.records || []) {
      const pid = r.get('productId');
      if (boughtSet.has(pid)) continue;
      const support = toNumber(r.get('support'));
      candidates.push({
        productId: pid,
        rawScore: toNumber(r.get('rawScore')),
        support,
        source: 'cross_category',
        evidence: `Khách mua cùng khác danh mục (${support} người mua)`,
        categoryName: r.get('categoryName'),
        categoryId: r.get('categoryId'),
      });
    }
    return normalizeScores(candidates);
  }

  // Source E: Similar / Substitutes based on category and price tier
  generateSourceE_Substitutes(catalog, anchorProducts, boughtSet) {
    if (!anchorProducts || anchorProducts.length === 0) return [];
    const candidateMap = new Map();

    for (const anchor of anchorProducts) {
      if (!anchor || !anchor.categoryId) continue;
      const anchorPrice = anchor.price || 0;

      for (const prod of catalog) {
        if (prod.productId === anchor.productId) continue;
        if (boughtSet.has(prod.productId)) continue;

        // Substitute: same category and price within +/- 35%
        if (prod.categoryId === anchor.categoryId) {
          const maxP = Math.max(anchorPrice, prod.price || 1);
          const priceDiffRatio = Math.abs(anchorPrice - (prod.price || 0)) / maxP;
          if (priceDiffRatio <= 0.35) {
            const rawScore = 1.0 - priceDiffRatio;
            const existing = candidateMap.get(prod.productId);
            if (!existing || existing.rawScore < rawScore) {
              candidateMap.set(prod.productId, {
                productId: prod.productId,
                rawScore,
                source: 'substitute',
                evidence: `Sản phẩm tương tự cùng phân khúc giá`,
              });
            }
          }
        }
      }
    }
    return normalizeScores(Array.from(candidateMap.values()));
  }

  // Source F: Fallback popular products among distinct buyers
  async generateSourceF_Fallback(boughtSet, limit = 20) {
    const res = await this.neo4j.read(`
      MATCH (c:Customer { role: 'customer', active: true })-[:BOUGHT]->(p:Product)
      WHERE p.active = true
      WITH p, count(DISTINCT c) AS buyers
      RETURN p.productId AS productId, buyers AS rawScore
      ORDER BY rawScore DESC, p.productId ASC
      LIMIT $limit
    `, { limit: neo4j.int(limit) });

    const candidates = [];
    for (const r of res.records || []) {
      const pid = r.get('productId');
      if (boughtSet.has(pid)) continue;
      candidates.push({
        productId: pid,
        rawScore: toNumber(r.get('rawScore')),
        source: 'fallback',
        evidence: `Sản phẩm phổ biến được nhiều người chọn`,
      });
    }
    return normalizeScores(candidates);
  }

  // Merges, scores, filters, rotates, and formats the hybrid feed
  async getHybridFeed({
    actor,
    visitId = 'visit_001',
    feedId = 'home_feed',
    page = 1,
    pageSize = 10,
    categoryId = null,
    priceMin = null,
    priceMax = null,
    excludeProductId = null,
  }) {
    const isCustomer = actor.type === 'customer';
    const [catalog, actorState] = await Promise.all([
      this.getActiveCatalog(),
      this.getActorState(actor, feedId),
    ]);

    const { boughtSet, dismissedSet, searches, activeSearchIntent, views, impressions } = actorState;
    if (excludeProductId) {
      boughtSet.add(excludeProductId);
    }

    // Anchors for co-bought and cross-category
    let intentAnchorIds = [];
    if (activeSearchIntent && activeSearchIntent.category) {
      intentAnchorIds = catalog
        .filter((p) => p.categoryId === activeSearchIntent.category.id && (!activeSearchIntent.maxPrice || p.price <= activeSearchIntent.maxPrice))
        .slice(0, 5)
        .map((p) => p.productId);
    }

    const anchorIds = [...new Set([...views.slice(0, 3).map((v) => v.productId), ...intentAnchorIds])];
    const anchorProds = catalog.filter((p) => anchorIds.includes(p.productId));

    // Concurrently fetch candidate pools
    const [srcA, srcB, srcD, srcCrossCat, srcF] = await Promise.all([
      isCustomer ? this.generateSourceA_UserCF(actor.id, boughtSet) : Promise.resolve([]),
      isCustomer ? this.generateSourceB_MultiBehavior(actor.id, boughtSet) : Promise.resolve([]),
      this.generateSourceD_CoBought(anchorIds, boughtSet),
      this.generateSourceCrossCategory(anchorIds, boughtSet),
      this.generateSourceF_Fallback(boughtSet, 25),
    ]);

    const srcC = this.generateSourceC_SearchIntent(catalog, searches, boughtSet);
    const srcE = this.generateSourceE_Substitutes(catalog, anchorProds, boughtSet);

    // Merge candidates by productId
    const mergedMap = new Map();

    function addCandidates(list, weight, sourceName, reasonText) {
      for (const item of list) {
        let entry = mergedMap.get(item.productId);
        if (!entry) {
          entry = {
            productId: item.productId,
            combinedScore: 0,
            primarySource: sourceName,
            highestWeight: 0,
            reason: reasonText,
            sources: {},
          };
          mergedMap.set(item.productId, entry);
        }
        const contribution = item.normScore * weight;
        entry.combinedScore += contribution;
        entry.sources[sourceName] = contribution;
        if (contribution > entry.highestWeight) {
          entry.highestWeight = contribution;
          entry.primarySource = sourceName;
          entry.reason = reasonText;
        }
      }
    }

    addCandidates(srcA, CONFIG.WEIGHTS.USER_CF, 'cf', 'Khách hàng mua chung cũng chọn');
    addCandidates(srcB, CONFIG.WEIGHTS.MULTI_BEHAVIOR, 'multibehavior', 'Khách hàng có sở thích tương tự cũng quan tâm món này');
    addCandidates(srcC, CONFIG.WEIGHTS.SEARCH_INTENT_FRESH, 'search', 'Dựa trên tìm kiếm gần đây');
    addCandidates(srcD, CONFIG.WEIGHTS.CO_BOUGHT, 'co_bought', 'Khách mua sản phẩm này cũng chọn');
    addCandidates(srcCrossCat, CONFIG.WEIGHTS.CROSS_CATEGORY, 'cross_category', 'Sản phẩm thường được mua kèm');
    addCandidates(srcE, CONFIG.WEIGHTS.SUBSTITUTE, 'substitute', 'Lựa chọn tương tự cùng phân khúc');
    addCandidates(srcF, CONFIG.WEIGHTS.FALLBACK, 'fallback', 'Khám phá thêm');

    // Impression penalty map (seen in last 14 days)
    const impressionPenaltyMap = new Map();
    for (const imp of impressions) {
      const decay = calculateDecay(imp.ageDays, CONFIG.HALF_LIFE_DAYS.IMPRESSION_PENALTY);
      const pen = CONFIG.REPETITION_PENALTY * decay;
      const current = impressionPenaltyMap.get(imp.productId) || 0;
      if (pen > current) impressionPenaltyMap.set(imp.productId, pen);
    }

    const catalogMap = new Map(catalog.map((p) => [p.productId, p]));

    // Apply filters, dismissal exclusions, repetition penalties, and active intent budget constraints
    const eligible = [];
    for (const [pid, entry] of mergedMap.entries()) {
      if (boughtSet.has(pid)) continue;
      if (dismissedSet.has(pid)) continue;

      const prod = catalogMap.get(pid);
      if (!prod) continue;

      // Price and Category filters (explicit query params)
      if (categoryId && prod.categoryId !== categoryId) continue;
      if (priceMin !== null && prod.price < priceMin) continue;
      if (priceMax !== null && prod.price > priceMax) continue;

      // Active Search Intent constraints:
      // Hard enforce budget bounds on the intent's main category
      if (activeSearchIntent) {
        const isMainCategory = activeSearchIntent.category && prod.categoryId === activeSearchIntent.category.id;
        if (isMainCategory) {
          if (activeSearchIntent.maxPrice !== null) {
            if (activeSearchIntent.inclusiveMax === false && prod.price >= activeSearchIntent.maxPrice) continue;
            if (activeSearchIntent.inclusiveMax === true && prod.price > activeSearchIntent.maxPrice) continue;
          }
          if (activeSearchIntent.minPrice !== null) {
            if (activeSearchIntent.inclusiveMin === false && prod.price <= activeSearchIntent.minPrice) continue;
            if (activeSearchIntent.inclusiveMin === true && prod.price < activeSearchIntent.minPrice) continue;
          }
          if (activeSearchIntent.excludedBrands && activeSearchIntent.excludedBrands.includes(prod.brand)) {
            continue;
          }

          // Target price proximity boost:
          if (activeSearchIntent.targetPrice !== null) {
            const diffRatio = Math.abs(prod.price - activeSearchIntent.targetPrice) / (activeSearchIntent.targetPrice * 0.25);
            const proximity = Math.max(0, 1.0 - diffRatio);
            entry.combinedScore += proximity * 1.5;
          }
        }
      }

      // Soft impression repetition penalty
      const pen = impressionPenaltyMap.get(pid) || 0;
      const finalScore = Math.max(0.01, entry.combinedScore - pen);

      eligible.push({
        ...entry,
        finalScore,
        product: prod,
      });
    }

    // Sort descending by finalScore
    eligible.sort((a, b) => b.finalScore - a.finalScore || a.productId.localeCompare(b.productId));

    // Controlled rotation: deterministic seed based on actor, visitId, and feedId
    const seed = stringHash(`${actor.id}:${visitId}:${feedId}`);
    const rng = createSeededRandom(seed);

    // Keep top 35% fixed (best matches); rotate remaining with soft perturbation
    const fixedCutoff = Math.max(2, Math.floor(pageSize * 0.35));
    const fixedTop = eligible.slice(0, fixedCutoff);
    const candidateTail = eligible.slice(fixedCutoff);

    const perturbedTail = candidateTail.map((c) => ({
      ...c,
      sortKey: c.finalScore * (0.85 + rng() * 0.3),
    }));
    perturbedTail.sort((a, b) => b.sortKey - a.sortKey || a.productId.localeCompare(b.productId));

    const fullRanked = [...fixedTop, ...perturbedTail];

    // Relevant Serendipity Re-ranking (positions 3 & 7, max 2 slots)
    // Candidate must satisfy: relevance >= 0.2, novelty, diversity, unexpectedness
    const popularSet = new Set(srcF.slice(0, 10).map((x) => x.productId));
    const topProd = fullRanked[0]?.product;

    const serendipityCandidates = [];
    for (let i = fixedCutoff; i < fullRanked.length; i++) {
      const cand = fullRanked[i];
      if (cand.finalScore < 0.2) continue; // Hard relevance floor

      const pen = impressionPenaltyMap.get(cand.productId) || 0;
      const novelty = Math.max(0, 1.0 - pen * 3.0);
      const isDiffBrand = cand.product.brand && cand.product.brand !== topProd?.brand;
      const isDiffCat = cand.product.categoryId && cand.product.categoryId !== topProd?.categoryId;
      const diversity = (isDiffBrand ? 0.6 : 0) + (isDiffCat ? 0.4 : 0);
      const unexpectedness = popularSet.has(cand.productId) ? 0.2 : 0.85;

      const serendipityScore = cand.finalScore * 0.4 + novelty * 0.25 + diversity * 0.2 + unexpectedness * 0.15;
      if (serendipityScore >= 0.65) {
        serendipityCandidates.push({ candidate: cand, serendipityScore });
      }
    }

    serendipityCandidates.sort((a, b) => b.serendipityScore - a.serendipityScore);

    // Insert at most 2 serendipity items into fixed slots
    const SERENDIPITY_MAX_SLOTS = 2;
    const targetSlots = [3, 7];
    const insertedIds = new Set();
    let sIdx = 0;
    for (const slot of targetSlots) {
      if (sIdx >= serendipityCandidates.length || sIdx >= SERENDIPITY_MAX_SLOTS) break;
      if (slot >= fullRanked.length) break;

      const sCand = serendipityCandidates[sIdx].candidate;
      if (!insertedIds.has(sCand.productId)) {
        sCand.isSerendipity = true;
        sCand.primarySource = 'serendipity';
        sCand.reason = 'Khám phá mới có liên quan';

        const currIndex = fullRanked.findIndex((x) => x.productId === sCand.productId);
        if (currIndex > slot) {
          fullRanked.splice(currIndex, 1);
          fullRanked.splice(slot, 0, sCand);
          insertedIds.add(sCand.productId);
          sIdx++;
        }
      }
    }

    // Pagination (stable sequence per visit)
    const skip = (page - 1) * pageSize;
    const pageItems = fullRanked.slice(skip, skip + pageSize);

    const items = pageItems.map((c) => ({
      productId: c.product.productId,
      name: c.product.name,
      price: c.product.price,
      imageUrl: c.product.imageUrl,
      brand: c.product.brand,
      model: c.product.model,
      categoryName: c.product.categoryName,
      score: Math.round(c.finalScore * 10) / 10,
      support: (srcA.find((x) => x.productId === c.productId) || {}).support || 1,
      reason: c.reason,
      source: c.primarySource,
      isSerendipity: Boolean(c.isSerendipity),
      _debug: {
        sources: c.sources,
        combinedScore: c.combinedScore,
        finalScore: c.finalScore,
      },
    }));

    // Cross-Category Add-ons ("Có thể bạn cũng cần")
    const mainItemIds = new Set(items.map((x) => x.productId));
    const crossCategoryItems = srcCrossCat
      .filter((c) => !mainItemIds.has(c.productId) && !boughtSet.has(c.productId) && !dismissedSet.has(c.productId))
      .slice(0, 4)
      .map((c) => {
        const prod = catalogMap.get(c.productId);
        return {
          productId: c.productId,
          name: prod?.name || c.productId,
          price: prod?.price || 0,
          imageUrl: prod?.imageUrl || null,
          brand: prod?.brand || '',
          categoryName: prod?.categoryName || c.categoryName || '',
          score: Math.round(c.rawScore * 10) / 10,
          support: c.support,
          reason: c.evidence,
          source: 'cross_category',
        };
      });

    // Bundle total suggestions if query has bundle_total scope
    const bundles = [];
    if (activeSearchIntent && activeSearchIntent.budgetScope === 'bundle_total' && activeSearchIntent.maxPrice) {
      const totalCap = activeSearchIntent.maxPrice;
      const mainProds = fullRanked
        .filter((c) => c.product.categoryId === activeSearchIntent.category?.id)
        .slice(0, 3)
        .map((c) => c.product);

      for (const m of mainProds) {
        for (const xc of crossCategoryItems) {
          const comboPrice = m.price + xc.price;
          if (comboPrice <= totalCap) {
            bundles.push({
              mainProduct: { productId: m.productId, name: m.name, price: m.price, categoryName: m.categoryName },
              addonProduct: { productId: xc.productId, name: xc.name, price: xc.price, categoryName: xc.categoryName },
              totalPrice: comboPrice,
              savingsText: `Tổng giá gói: ${comboPrice.toLocaleString('vi-VN')}đ (Dưới ngân sách ${totalCap.toLocaleString('vi-VN')}đ)`,
            });
            break;
          }
        }
      }
    }

    return {
      feedId,
      visitId,
      page,
      pageSize,
      total: fullRanked.length,
      items,
      crossCategoryItems,
      bundles,
      activeIntent: activeSearchIntent,
      reason: items.length > 0 ? 'Dành cho bạn' : 'Chưa có gợi ý phù hợp',
    };
  }

  // Detail Page recommendations: returns distinct Co-bought, Substitutes, and Cross-Category
  async getDetailRecommendations({ productId, actor, limit = 5 }) {
    const isCustomer = actor.type === 'customer';
    const [initialCatalog, actorState] = await Promise.all([
      this.getActiveCatalog(),
      this.getActorState(actor, 'detail_feed'),
    ]);
    let catalog = initialCatalog;

    const { boughtSet, dismissedSet } = actorState;
    boughtSet.add(productId); // Exclude the source product itself

    let sourceProd = catalog.find((p) => p.productId === productId);
    if (!sourceProd) {
      this.catalogCacheExpiresAt = 0;
      catalog = await this.getActiveCatalog();
      sourceProd = catalog.find((p) => p.productId === productId);
      if (!sourceProd) {
        throw Object.assign(new Error('San pham khong ton tai.'), { status: 404, code: 'PRODUCT_NOT_FOUND' });
      }
    }

    // 1. Genuine Co-bought from customers who bought source product in same category
    const coBoughtRes = await this.neo4j.read(`
      MATCH (source:Product { productId: $productId, active: true })-[:BELONGS_TO]->(sourceCat:Category)
      MATCH (source)<-[:BOUGHT]-(b:Customer)-[:BOUGHT]->(cand:Product)-[:BELONGS_TO]->(sourceCat)
      WHERE b.role = 'customer' AND b.active = true
        AND cand <> source AND cand.active = true
        ${isCustomer ? 'AND NOT EXISTS { MATCH (c:Customer { customerId: $customerId })-[:BOUGHT]->(cand) }' : ''}
      WITH cand, count(DISTINCT b) AS support
      RETURN cand.productId AS productId, support
      ORDER BY support DESC, cand.productId ASC
      LIMIT $limit
    `, {
      productId,
      customerId: actor.id,
      limit: neo4j.int(limit * 2),
    });

    const catalogMap = new Map(catalog.map((p) => [p.productId, p]));
    const coBought = [];
    for (const r of coBoughtRes.records || []) {
      const pid = r.get('productId');
      if (boughtSet.has(pid) || dismissedSet.has(pid)) continue;
      const p = catalogMap.get(pid);
      if (!p) continue;
      const support = toNumber(r.get('support'));
      coBought.push({
        productId: p.productId,
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl,
        brand: p.brand,
        categoryName: p.categoryName,
        score: support,
        support,
        reason: 'Khách mua sản phẩm này cũng chọn',
        source: 'co_bought',
      });
      if (coBought.length >= limit) break;
    }

    // 2. Substitutes: Same category, +/- 35% price
    const sourcePrice = sourceProd.price || 0;
    const substitutes = [];
    for (const p of catalog) {
      if (p.productId === productId) continue;
      if (boughtSet.has(p.productId) || dismissedSet.has(p.productId)) continue;
      if (p.categoryId === sourceProd.categoryId) {
        const maxP = Math.max(sourcePrice, p.price || 1);
        const diff = Math.abs(sourcePrice - (p.price || 0)) / maxP;
        if (diff <= 0.35) {
          substitutes.push({
            productId: p.productId,
            name: p.name,
            price: p.price,
            imageUrl: p.imageUrl,
            brand: p.brand,
            categoryName: p.categoryName,
            score: Math.round((1.0 - diff) * 10) / 10,
            support: 1,
            reason: 'Lựa chọn tương tự',
            source: 'substitute',
            diff,
          });
        }
      }
    }
    substitutes.sort((a, b) => a.diff - b.diff || a.productId.localeCompare(b.productId));
    const topSubstitutes = substitutes.slice(0, limit).map(({ diff: _diff, ...rest }) => rest);

    // 3. Cross-Category Collaborative Filtering ("Có thể bạn cũng cần")
    const srcCrossCat = await this.generateSourceCrossCategory([productId], boughtSet);
    const seenPids = new Set([productId, ...coBought.map((x) => x.productId), ...topSubstitutes.map((x) => x.productId)]);
    const crossCategory = srcCrossCat
      .filter((c) => !seenPids.has(c.productId) && !boughtSet.has(c.productId) && !dismissedSet.has(c.productId))
      .slice(0, limit)
      .map((c) => {
        const p = catalogMap.get(c.productId);
        return {
          productId: c.productId,
          name: p?.name || c.productId,
          price: p?.price || 0,
          imageUrl: p?.imageUrl || null,
          brand: p?.brand || '',
          categoryName: p?.categoryName || c.categoryName || '',
          score: Math.round(c.rawScore * 10) / 10,
          support: c.support,
          reason: c.evidence,
          source: 'cross_category',
        };
      });

    return {
      sourceProductId: productId,
      coBought,
      substitutes: topSubstitutes,
      crossCategory,
    };
  }
}
