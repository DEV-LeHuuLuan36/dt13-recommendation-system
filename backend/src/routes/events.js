import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { EVENTS } from '../cypher/queries.js';
import { runInTransaction, runRead } from '../lib/tx.js';
import { validateEventId, validateId, ValidationError } from '../lib/validate.js';
import { normalizeSearchQuery } from '../lib/vietnamese.js';
import { parseSearchIntent, PARSER_VERSION } from '../lib/searchIntentParser.js';

export function createEventsRouter({ neo4jClient }) {
  const router = Router();

  function requireClient() {
    if (!neo4jClient) {
      throw Object.assign(new Error('Backend chua ket noi CSDL.'), {
        status: 503,
        code: 'NEO4J_NOT_CONFIGURED',
      });
    }
  }

  // POST /api/events/search or /searches — Record user search query (debounced or Enter)
  router.post(
    ['/search', '/searches'],
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };

      // Never record admin actions as shopping preferences
      if (actor.role === 'admin') {
        return res.status(200).json({ status: 'ok', ignored: true, reason: 'admin_action' });
      }

      const rawQuery = (req.body && req.body.query) || '';
      if (typeof rawQuery !== 'string' || !rawQuery.trim()) {
        throw new ValidationError('Tu khoa tim kiem khong duoc de trong.', 'INVALID_QUERY');
      }

      const eventId = validateEventId(req.body.eventId);
      const query = rawQuery.trim().slice(0, 100);
      const normalizedQuery = normalizeSearchQuery(query);
      const intent = parseSearchIntent(query);
      const intentJson = JSON.stringify(intent);

      const result = await runInTransaction(neo4jClient, async (tx) => {
        // Idempotency check: see if eventId already processed
        const existing = await tx.run(EVENTS.findSearchByEventId, { eventId });
        if (existing.records[0]) {
          return { status: 200, body: { status: 'ok', eventId, query, intent } };
        }

        if (actor.type === 'customer') {
          await tx.run(EVENTS.recordSearchForCustomer, {
            customerId: actor.id,
            eventId,
            rawQuery: query,
            query,
            normalizedQuery,
            parserVersion: PARSER_VERSION,
            intentJson,
            datasetTag: 'DT13_SEARCH_EVENT',
          });
        } else {
          await tx.run(EVENTS.recordSearchForGuest, {
            guestId: actor.id,
            eventId,
            rawQuery: query,
            query,
            normalizedQuery,
            parserVersion: PARSER_VERSION,
            intentJson,
            datasetTag: 'DT13_SEARCH_EVENT',
          });
        }

        return { status: 201, body: { status: 'ok', eventId, query, normalizedQuery, intent } };
      });

      return res.status(result.status).json(result.body);
    })
  );

  // POST /api/events/view — Record product view (for guests and customers)
  router.post(
    '/view',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      if (actor.role === 'admin') {
        return res.status(200).json({ status: 'ok', ignored: true });
      }

      const eventId = validateEventId(req.body.eventId);
      const productId = validateId(req.body.productId, 'productId');

      if (actor.type === 'customer') {
        await neo4jClient.write(
          `
          MATCH (c:Customer { customerId: $customerId })
          MATCH (p:Product { productId: $productId })
          MERGE (c)-[r:VIEWED { eventId: $eventId }]->(p)
          ON CREATE SET r.viewedAt = datetime()
          RETURN r
          `,
          { customerId: actor.id, productId, eventId }
        );
      } else {
        await neo4jClient.write(EVENTS.recordViewForGuest, {
          guestId: actor.id,
          productId,
          eventId,
        });
      }

      return res.status(200).json({ status: 'ok', eventId, productId });
    })
  );

  // POST /api/events/impression — Record visible recommendation cards
  router.post(
    '/impression',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      if (actor.role === 'admin') {
        return res.status(200).json({ status: 'ok', ignored: true });
      }

      const eventId = validateEventId(req.body.eventId);
      const feedId = String(req.body.feedId || 'home_feed').trim().slice(0, 50);
      const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

      if (rawItems.length === 0) {
        return res.status(200).json({ status: 'ok', count: 0 });
      }

      // Sanitize items list
      const items = rawItems
        .filter((it) => it && typeof it.productId === 'string')
        .map((it, idx) => ({
          productId: validateId(it.productId, 'productId'),
          position: Number.isInteger(it.position) ? it.position : idx + 1,
        }));

      if (items.length === 0) {
        return res.status(200).json({ status: 'ok', count: 0 });
      }

      const query = actor.type === 'customer'
        ? EVENTS.recordImpressionForCustomer
        : EVENTS.recordImpressionForGuest;
      const params = actor.type === 'customer'
        ? { customerId: actor.id, feedId, eventId, items }
        : { guestId: actor.id, feedId, eventId, items };

      await neo4jClient.write(query, params);
      return res.status(200).json({ status: 'ok', feedId, count: items.length });
    })
  );

  // POST /api/events/click — Recommendation card click
  router.post(
    '/click',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      if (actor.role === 'admin') {
        return res.status(200).json({ status: 'ok', ignored: true });
      }

      const eventId = validateEventId(req.body.eventId);
      const productId = validateId(req.body.productId, 'productId');
      const feedId = String(req.body.feedId || 'home_feed').trim().slice(0, 50);
      const position = Number.isInteger(req.body.position) ? req.body.position : 1;

      const query = actor.type === 'customer'
        ? EVENTS.recordClickForCustomer
        : EVENTS.recordClickForGuest;
      const params = actor.type === 'customer'
        ? { customerId: actor.id, productId, feedId, eventId, position }
        : { guestId: actor.id, productId, feedId, eventId, position };

      await neo4jClient.write(query, params);
      return res.status(200).json({ status: 'ok', eventId, productId, feedId });
    })
  );

  // POST /api/events/dismiss — "Không quan tâm" button click
  router.post(
    '/dismiss',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      if (actor.role === 'admin') {
        return res.status(200).json({ status: 'ok', ignored: true });
      }

      const eventId = validateEventId(req.body.eventId);
      const productId = validateId(req.body.productId, 'productId');
      const reason = typeof req.body.reason === 'string' ? req.body.reason.slice(0, 100) : 'not_interested';

      const query = actor.type === 'customer'
        ? EVENTS.recordDismissForCustomer
        : EVENTS.recordDismissForGuest;
      const params = actor.type === 'customer'
        ? { customerId: actor.id, productId, eventId, reason }
        : { guestId: actor.id, productId, eventId, reason };

      await neo4jClient.write(query, params);
      return res.status(200).json({ status: 'ok', eventId, productId, dismissed: true });
    })
  );

  // POST /api/events/undo-dismiss — Undo dismissal
  router.post(
    '/undo-dismiss',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      const productId = req.body.productId ? validateId(req.body.productId, 'productId') : null;
      const eventId = req.body.eventId ? validateEventId(req.body.eventId) : null;

      if (!productId && !eventId) {
        throw new ValidationError('Can co productId hoac eventId de hoan tac.', 'MISSING_PARAM');
      }

      const query = actor.type === 'customer'
        ? EVENTS.undoDismissForCustomer
        : EVENTS.undoDismissForGuest;
      const params = actor.type === 'customer'
        ? { customerId: actor.id, productId, eventId }
        : { guestId: actor.id, productId, eventId };

      const result = await neo4jClient.write(query, params);
      const updated = result.records[0] ? result.records[0].get('updated') : 0;
      return res.status(200).json({ status: 'ok', productId, undone: true, count: updated });
    })
  );

  // GET /api/me/searches (also accessible via /api/events/searches)
  router.get(
    '/searches',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      if (actor.role === 'admin') {
        return res.status(200).json({ items: [] });
      }

      const query = actor.type === 'customer'
        ? EVENTS.listSearchesForCustomer
        : EVENTS.listSearchesForGuest;
      const params = actor.type === 'customer'
        ? { customerId: actor.id }
        : { guestId: actor.id };

      const result = await runRead(neo4jClient, query, params);
      const items = (result.records || []).map((r) => {
        let intent = null;
        try {
          const raw = r.get('intentJson');
          if (raw) intent = JSON.parse(raw);
        } catch {
          /* ignore */
        }
        return {
          eventId: r.get('eventId'),
          query: r.get('query'),
          rawQuery: r.get('rawQuery') || r.get('query'),
          parserVersion: r.get('parserVersion') || null,
          intent,
          createdAt: r.get('createdAt'),
        };
      });

      return res.status(200).json({ items });
    })
  );

  // DELETE /api/me/searches — Clear search history
  router.delete(
    '/searches',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      if (actor.role === 'admin') {
        return res.status(200).json({ status: 'ok', cleared: true });
      }

      const query = actor.type === 'customer'
        ? EVENTS.clearSearchesForCustomer
        : EVENTS.clearSearchesForGuest;
      const params = actor.type === 'customer'
        ? { customerId: actor.id }
        : { guestId: actor.id };

      await neo4jClient.write(query, params);
      return res.status(200).json({ status: 'ok', cleared: true });
    })
  );

  // DELETE /api/me/searches/:eventId — Delete a single search item
  router.delete(
    '/searches/:eventId',
    asyncHandler(async (req, res) => {
      requireClient();
      const actor = req.actor || { type: 'guest', id: 'unknown', role: 'guest' };
      const eventId = validateEventId(req.params.eventId);

      const query = actor.type === 'customer'
        ? EVENTS.deleteSearchForCustomer
        : EVENTS.deleteSearchForGuest;
      const params = actor.type === 'customer'
        ? { customerId: actor.id, eventId }
        : { guestId: actor.id, eventId };

      await neo4jClient.write(query, params);
      return res.status(200).json({ status: 'ok', deleted: true, eventId });
    })
  );

  return router;
}
