/**
 * Test verifying late response race condition handling using the ACTUAL production controller:
 * Directly imports createRecommendationController from frontend/src/utils/recommendationController.js
 * used by Recommendations.jsx.
 *
 * Scenario:
 * a. Customer A initiates recommendation request, but response is delayed/held.
 * b. Logout A, login B -> active identity switches to B.
 * c. Response B completes -> state receives B's items.
 * d. Response A completes afterwards (even if abort signal was ignored or failed).
 * e. Verify state strictly keeps B's data and completely discards A's items.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationController } from '../../frontend/src/utils/recommendationController.js';

test('race condition: production createRecommendationController discards late arriving response from previous user', async () => {
  // State container mimicking Recommendations.jsx component state
  const state = {
    data: null,
    status: { kind: 'idle', error: null },
  };

  let activeCustomerId = null;

  // Deferred promise controllers for A and B
  let resolveA;
  const promiseA = new Promise((resolve) => {
    resolveA = resolve;
  });

  let resolveB;
  const promiseB = new Promise((resolve) => {
    resolveB = resolve;
  });

  // Wire production controller using the exact same signature as Recommendations.jsx
  const controller = createRecommendationController({
    getCustomerId: () => activeCustomerId,
    onStartLoading: () => {
      state.status = { kind: 'loading', error: null };
    },
    onSuccess: (res) => {
      state.data = res;
      state.status = { kind: 'ready', error: null };
    },
    onError: (err) => {
      state.status = { kind: 'error', error: err.message };
      state.data = null;
    },
    fetchFn: (params) => {
      if (params.user === 'A') return promiseA;
      if (params.user === 'B') return promiseB;
      return Promise.resolve(null);
    },
  });

  // Step a: Customer A starts recommendation request, response is held
  activeCustomerId = 'CUST_A';
  const executionA = controller.fetch({ user: 'A' });

  assert.equal(controller.getSeq(), 1);
  assert.equal(state.status.kind, 'loading');

  // Step b: Logout A and login B
  activeCustomerId = 'CUST_B';
  state.data = null; // Component clears data on customer switch

  // Customer B triggers recommendation request
  const executionB = controller.fetch({ user: 'B' });
  assert.equal(controller.getSeq(), 2);

  // Step c: Response B completes first
  const dataB = {
    method: 'user_cf',
    items: [{ productId: 'PROD_B_EXCLUSIVE', name: 'Sản phẩm riêng của B', score: 3 }],
  };
  resolveB(dataB);
  await executionB;

  // Verify UI displays B's data
  assert.equal(state.status.kind, 'ready');
  assert.ok(state.data);
  assert.equal(state.data.items[0].productId, 'PROD_B_EXCLUSIVE');

  // Step d: Response A completes afterwards (simulating delayed response arriving late)
  const dataA = {
    method: 'user_cf',
    items: [{ productId: 'PROD_A_EXCLUSIVE', name: 'Sản phẩm riêng của A', score: 5 }],
  };
  resolveA(dataA);
  await executionA;

  // Step e: Confirm UI still holds B's data and NEVER overwrote with A's data
  assert.equal(state.status.kind, 'ready');
  assert.ok(state.data);
  assert.equal(state.data.items[0].productId, 'PROD_B_EXCLUSIVE', 'Production controller must preserve B data');
  assert.ok(!state.data.items.some((it) => it.productId === 'PROD_A_EXCLUSIVE'), 'A items must never appear in B state');
});
