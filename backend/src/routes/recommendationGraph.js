import { Router } from 'express';
import neo4j from 'neo4j-driver';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { QUERIES } from '../cypher/queries.js';
import { runRead } from '../lib/tx.js';
import {
  validateId,
  ValidationError,
  NotFoundError,
} from '../lib/validate.js';
import { toNumber } from '../lib/mappers.js';

// Admin recommendation-graph endpoint:
//   GET /api/analytics/recommendation-graph
//     ?customerId=<id>   required
//     &mode=user_cf|co_bought
//     &productId=<id>    required when mode=co_bought
//     &limit=1..20       default 5
// Returns items (top-K, computed against the full graph) plus a bounded
// illustrative subgraph for visualization.

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 1;
const MAX_LIMIT = 20;
const DEFAULT_MAX_NODES = 60;
const DEFAULT_MAX_EDGES = 120;
const DEFAULT_MAX_PEERS = 12;

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  if (typeof raw === 'string') {
    if (!/^\d+$/.test(raw)) {
      throw new ValidationError('limit phai la so nguyen duong.', 'INVALID_LIMIT');
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
      throw new ValidationError(`limit phai trong [${MIN_LIMIT}, ${MAX_LIMIT}].`, 'INVALID_LIMIT');
    }
    return n;
  }
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < MIN_LIMIT || raw > MAX_LIMIT) {
      throw new ValidationError(`limit phai trong [${MIN_LIMIT}, ${MAX_LIMIT}].`, 'INVALID_LIMIT');
    }
    return raw;
  }
  throw new ValidationError('limit phai la so nguyen.', 'INVALID_LIMIT');
}

function parseMode(raw) {
  if (raw === undefined || raw === null || raw === '') return 'user_cf';
  if (raw !== 'user_cf' && raw !== 'co_bought') {
    throw new ValidationError('mode phai la user_cf hoac co_bought.', 'INVALID_MODE');
  }
  return raw;
}

function toIntParam(n) {
  return neo4j.int(n);
}

function makeNodeId(type, id) {
  return `${type}:${id}`;
}

function mapItem(r) {
  return {
    productId: r.get('productId'),
    name: r.get('name'),
    price: toNumber(r.get('price')),
    imageUrl: r.get('imageUrl'),
    score: toNumber(r.get('score')),
    support: toNumber(r.get('support')),
  };
}

async function fetchItems(neo4jClient, { mode, productId, customerId, limit }) {
  const query = mode === 'user_cf' ? QUERIES.recommendForMe : QUERIES.recommendForProduct;
  const params = mode === 'user_cf'
    ? { customerId, limit: toIntParam(limit) }
    : { customerId, productId, limit: toIntParam(limit) };
  const result = await runRead(neo4jClient, query, params);
  return (result.records || []).map(mapItem);
}

async function fetchPeerCandidates(neo4jClient, { mode, productId, customerId, maxRows }) {
  if (mode === 'user_cf') {
    const peerRes = await runRead(neo4jClient, QUERIES.cfPeers, {
      customerId,
      maxPeers: toIntParam(DEFAULT_MAX_PEERS),
    });
    const peers = (peerRes.records || []).map((r) => ({
      customerId: r.get('customerId'),
      sharedCount: toNumber(r.get('sharedCount')),
    }));
    if (peers.length === 0) return { peers, candidates: [] };
    const peerIds = peers.map((p) => p.customerId);
    const candRes = await runRead(neo4jClient, `
        MATCH (peer:Customer)-[:BOUGHT]->(p:Product)
        WHERE peer.customerId IN $peerIds AND p.active = true
          AND NOT EXISTS { MATCH (c1:Customer { customerId: $customerId })-[:BOUGHT]->(p) }
        RETURN DISTINCT p.productId AS productId
        LIMIT toInteger($maxRows)
      `, { peerIds, customerId, maxRows: toIntParam(maxRows) });
    const candidates = (candRes.records || []).map((r) => r.get('productId'));
    return { peers, candidates };
  }
  // co_bought
  const buyerRes = await runRead(neo4jClient, QUERIES.coBoughtBuyers, {
    productId,
    maxK: toIntParam(DEFAULT_MAX_PEERS),
  });
  const buyers = (buyerRes.records || []).map((r) => r.get('customerId'));
  if (buyers.length === 0) return { peers: [], candidates: [] };
  const candRes = await runRead(neo4jClient, QUERIES.coBoughtBuyerCandidates, {
    productId,
    maxRows: toIntParam(maxRows),
  });
  const seen = new Set();
  const candidates = [];
  for (const r of candRes.records) {
    const pid = r.get('productId');
    if (!seen.has(pid)) {
      seen.add(pid);
      candidates.push(pid);
    }
  }
  const peers = buyers.map((cid) => ({ customerId: cid, sharedCount: 1 }));
  return { peers, candidates };
}

async function fetchProductsByIds(neo4jClient, productIds) {
  if (productIds.length === 0) return new Map();
  const res = await runRead(neo4jClient, QUERIES.findProductsByIds, { productIds });
  const map = new Map();
  for (const r of res.records) {
    const pid = r.get('productId');
    map.set(pid, {
      productId: pid,
      name: r.get('name'),
      active: r.get('active'),
      imageUrl: r.get('imageUrl'),
      price: toNumber(r.get('price')),
    });
  }
  return map;
}

async function fetchCategoriesByProductIds(neo4jClient, productIds) {
  if (productIds.length === 0) return new Map();
  const res = await runRead(neo4jClient, QUERIES.findCategoriesByProductIds, { productIds });
  const map = new Map();
  for (const r of res.records) {
    const pid = r.get('productId');
    if (!map.has(pid)) {
      map.set(pid, {
        categoryId: r.get('categoryId'),
        categoryName: r.get('categoryName'),
      });
    }
  }
  return map;
}

function buildContributions({ mode, peerSlice }) {
  if (mode === 'user_cf') {
    return peerSlice.map((p) => ({
      peerId: p.customerId,
      peerAlias: null,
      sharedCount: p.sharedCount,
      contribution: p.sharedCount,
    }));
  }
  return peerSlice.map((p) => ({
    peerId: p.customerId,
    peerAlias: null,
    contribution: 1,
  }));
}

async function fetchSharedProductsForPeers(neo4jClient, { customerId, peerIds }) {
  if (peerIds.length === 0) return new Map();
  const res = await runRead(neo4jClient, `
      MATCH (c1:Customer { customerId: $customerId })-[:BOUGHT]->(p:Product)<-[:BOUGHT]-(peer:Customer)
      WHERE peer.customerId IN $peerIds
        AND c1.role = 'customer' AND c1.active = true
        AND peer.role = 'customer' AND peer.active = true
      WITH peer, collect(DISTINCT p.productId) AS sharedProductIds
      RETURN peer.customerId AS peerId, sharedProductIds
    `, { customerId, peerIds });
  const out = new Map();
  for (const r of res.records) {
    out.set(r.get('peerId'), r.get('sharedProductIds') || []);
  }
  return out;
}

export function createRecommendationGraphRouter({ neo4jClient }) {
  const router = Router();

  router.get(
    '/recommendation-graph',
    asyncHandler(async (req, res) => {
      if (!neo4jClient) {
        return res.status(503).json({
          error: { code: 'NEO4J_NOT_CONFIGURED', message: 'Backend chua ket noi CSDL.' },
        });
      }
      const mode = parseMode(req.query.mode);
      const customerId = validateId(req.query.customerId, 'customerId');
      const limit = parseLimit(req.query.limit);
      const productId = mode === 'co_bought' ? validateId(req.query.productId, 'productId') : null;

      const targetRes = await runRead(neo4jClient, QUERIES.findTargetCustomer, { customerId });
      if (!targetRes.records[0]) {
        throw new NotFoundError('Khach hang khong ton tai.', 'CUSTOMER_NOT_FOUND');
      }
      const targetRole = targetRes.records[0].get('role');
      const targetActive = targetRes.records[0].get('active');
      if (targetRole !== 'customer' || targetActive !== true) {
        throw new ValidationError(
          'customerId phai tro ve Customer role=customer va active=true.',
          'INVALID_TARGET'
        );
      }

      if (mode === 'co_bought') {
        const srcRes = await runRead(neo4jClient, QUERIES.findSourceProduct, { productId });
        if (!srcRes.records[0]) {
          throw new NotFoundError('San pham nguon khong ton tai.', 'PRODUCT_NOT_FOUND');
        }
        if (srcRes.records[0].get('active') === false) {
          throw new NotFoundError('San pham nguon dang ngung kinh doanh.', 'PRODUCT_NOT_FOUND');
        }
      }

      const items = await fetchItems(neo4jClient, { mode, productId, customerId, limit });
      const bounds = {
        maxNodes: DEFAULT_MAX_NODES,
        maxEdges: DEFAULT_MAX_EDGES,
        maxPeers: DEFAULT_MAX_PEERS,
      };
      const { peers, candidates } = await fetchPeerCandidates(neo4jClient, {
        mode,
        productId,
        customerId,
        maxRows: bounds.maxEdges,
      });

      const productIds = new Set();
      for (const it of items) productIds.add(it.productId);
      if (productId) productIds.add(productId);
      for (const c of candidates) productIds.add(c);
      const productMap = await fetchProductsByIds(neo4jClient, [...productIds]);
      const categoryMap = await fetchCategoriesByProductIds(neo4jClient, [...productIds]);

      // Graph shape:
      //   customer:target, customer:peer, product:source, product:item, product:shared
      // Edges: target→shared (BOUGHT), peer→shared (BOUGHT), peer→item (BOUGHT),
      //        peer→source (BOUGHT, co_bought only).
      const nodes = [];
      const edges = [];
      const nodeIdSet = new Set();

      const targetNodeId = makeNodeId('customer:target', customerId);
      nodes.push({
        id: targetNodeId,
        type: 'customer:target',
        label: 'Khach dang phan tich',
        customerId,
      });
      nodeIdSet.add(targetNodeId);

      let isPartial = false;

      const peerAliasMap = new Map();
      const peerSlice = peers.slice(0, bounds.maxPeers);
      if (peers.length > bounds.maxPeers) isPartial = true;
      for (let i = 0; i < peerSlice.length; i += 1) {
        const cid = peerSlice[i].customerId;
        const alias = `Nguoi mua ${i + 1}`;
        peerAliasMap.set(cid, alias);
        const nodeId = makeNodeId('customer:peer', cid);
        nodes.push({
          id: nodeId,
          type: 'customer:peer',
          label: alias,
          customerId: cid,
        });
        nodeIdSet.add(nodeId);
      }

      if (mode === 'co_bought' && productId) {
        const sourceNodeId = makeNodeId('product:source', productId);
        const info = productMap.get(productId);
        nodes.push({
          id: sourceNodeId,
          type: 'product:source',
          label: info ? info.name : productId,
          productId,
          active: info ? info.active : null,
        });
        nodeIdSet.add(sourceNodeId);
      }

      for (const it of items) {
        const nodeId = makeNodeId('product:item', it.productId);
        if (nodeIdSet.has(nodeId)) continue;
        if (nodes.length >= bounds.maxNodes) { isPartial = true; break; }
        const cat = categoryMap.get(it.productId);
        nodes.push({
          id: nodeId,
          type: 'product:item',
          label: it.name,
          productId: it.productId,
          score: it.score,
          support: it.support,
          categoryName: cat ? cat.categoryName : null,
        });
        nodeIdSet.add(nodeId);
      }

      const addEdge = (source, target, type, extra) => {
        if (edges.length >= bounds.maxEdges) { isPartial = true; return false; }
        edges.push({ source, target, type, ...(extra || {}) });
        return true;
      };

      if (mode === 'user_cf') {
        const peerSharedMap = await fetchSharedProductsForPeers(neo4jClient, {
          customerId,
          peerIds: peerSlice.map((p) => p.customerId),
        });
        for (const [peerId, sharedProducts] of peerSharedMap.entries()) {
          const peerNodeId = makeNodeId('customer:peer', peerId);
          for (const sp of sharedProducts) {
            const spNodeId = makeNodeId('product:shared', sp);
            if (!nodeIdSet.has(spNodeId)) {
              if (nodes.length >= bounds.maxNodes) { isPartial = true; break; }
              const info = productMap.get(sp);
              nodes.push({
                id: spNodeId,
                type: 'product:shared',
                label: info ? info.name : sp,
                productId: sp,
              });
              nodeIdSet.add(spNodeId);
            }
            addEdge(targetNodeId, spNodeId, 'BOUGHT');
            addEdge(peerNodeId, spNodeId, 'BOUGHT');
          }
        }
        const peerIds = peerSlice.map((p) => p.customerId);
        if (peerIds.length > 0 && items.length > 0) {
          const itemPids = items.map((it) => it.productId);
          const candEdgesRes = await runRead(neo4jClient, `
              MATCH (peer:Customer)-[:BOUGHT]->(p:Product)
              WHERE peer.customerId IN $peerIds AND p.productId IN $itemPids
                AND peer.role = 'customer' AND peer.active = true
              RETURN DISTINCT peer.customerId AS peerId, p.productId AS productId
              LIMIT toInteger($maxRows)
            `, { peerIds, itemPids, maxRows: toIntParam(bounds.maxEdges) });
          for (const r of candEdgesRes.records) {
            const pid = r.get('productId');
            const peerNodeId = makeNodeId('customer:peer', r.get('peerId'));
            const itemNodeId = makeNodeId('product:item', pid);
            if (!nodeIdSet.has(itemNodeId)) continue;
            addEdge(peerNodeId, itemNodeId, 'BOUGHT');
          }
        }
      } else {
        if (productId) {
          const sourceNodeId = makeNodeId('product:source', productId);
          for (const p of peerSlice) {
            const peerNodeId = makeNodeId('customer:peer', p.customerId);
            addEdge(peerNodeId, sourceNodeId, 'BOUGHT');
          }
        }
        if (peerSlice.length > 0 && items.length > 0) {
          const peerIds = peerSlice.map((p) => p.customerId);
          const itemPids = items.map((it) => it.productId);
          const candEdgesRes = await runRead(neo4jClient, `
              MATCH (peer:Customer)-[:BOUGHT]->(p:Product)
              WHERE peer.customerId IN $peerIds AND p.productId IN $itemPids
                AND peer.role = 'customer' AND peer.active = true
              RETURN DISTINCT peer.customerId AS peerId, p.productId AS productId
              LIMIT toInteger($maxRows)
            `, { peerIds, itemPids, maxRows: toIntParam(bounds.maxEdges) });
          for (const r of candEdgesRes.records) {
            const peerNodeId = makeNodeId('customer:peer', r.get('peerId'));
            const itemNodeId = makeNodeId('product:item', r.get('productId'));
            if (!nodeIdSet.has(itemNodeId)) continue;
            addEdge(peerNodeId, itemNodeId, 'BOUGHT');
          }
        }
      }

      const contributions = buildContributions({ mode, peerSlice }).map((c) => ({
        ...c,
        peerAlias: peerAliasMap.get(c.peerId) || null,
      }));

      const sampleTrimmed = peers.length > bounds.maxPeers
        || nodes.length > bounds.maxNodes
        || edges.length > bounds.maxEdges;
      const boundedSample = (sampleTrimmed ? peers.length : 0);

      const body = {
        method: mode,
        targetCustomerId: customerId,
        sourceProductId: productId,
        items,
        nodes,
        edges,
        contributions,
        isPartial,
        bounds: {
          ...bounds,
          actualNodeCount: nodes.length,
          actualEdgeCount: edges.length,
        },
        reason: items.length === 0
          ? 'Khong co ung vien (phase 5 minh hoa).'
          : null,
        sampleSummary: {
          totalPeers: peers.length,
          shownPeers: contributions.length,
          trimmedPeers: boundedSample,
        },
      };
      return res.status(200).json(body);
    })
  );

  return router;
}
