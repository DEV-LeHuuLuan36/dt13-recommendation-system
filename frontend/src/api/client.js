// Shared fetch wrapper with consistent error shape.
async function request(path, options = {}) {
  // Pull signal out of options so it never leaks into the body.
  const { signal, ...rest } = options;
  const opts = {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
  };
  if (signal) opts.signal = signal;
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw err;
  }
  let body = null;
  if (res.status !== 204) {
    try { body = await res.json(); } catch { /* ignore */ }
  }
  if (!res.ok) {
    const err = new Error((body && body.error && body.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body && body.error && body.error.code;
    err.body = body;
    throw err;
  }
  return body;
}

function buildQuery(params) {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // Products
  listProducts(params = {}, options = {}) {
    const { _signal, includeInactive, ...rest } = params;
    const queryParams = {
      ...rest,
      includeInactive: includeInactive ? 'true' : undefined,
    };
    const suffix = buildQuery(queryParams);
    return request(`/api/products${suffix}`, { ...options, signal: _signal });
  },
  getProduct(productId, { includeInactive = false } = {}) {
    const qs = includeInactive ? '?includeInactive=true' : '';
    return request(`/api/products/${encodeURIComponent(productId)}${qs}`);
  },
  createProduct(body) { return request('/api/products', { method: 'POST', body }); },
  updateProduct(productId, body) { return request(`/api/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body }); },
  deleteProduct(productId) { return request(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' }); },

  // Categories
  listCategories() { return request('/api/categories'); },
  createCategory(body) { return request('/api/categories', { method: 'POST', body }); },
  updateCategory(categoryId, body) { return request(`/api/categories/${encodeURIComponent(categoryId)}`, { method: 'PATCH', body }); },
  deleteCategory(categoryId) { return request(`/api/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }); },

  // Customer admin CRUD
  listCustomers(params = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/customers${suffix}`);
  },
  getCustomer(customerId) { return request(`/api/customers/${encodeURIComponent(customerId)}`); },
  createCustomer(body) { return request('/api/customers', { method: 'POST', body }); },
  updateCustomer(customerId, body) { return request(`/api/customers/${encodeURIComponent(customerId)}`, { method: 'PATCH', body }); },
  deleteCustomer(customerId) { return request(`/api/customers/${encodeURIComponent(customerId)}`, { method: 'DELETE' }); },

  // Interactions
  recordView(body) { return request('/api/interactions/views', { method: 'POST', body }); },
  recordPurchase(body) { return request('/api/interactions/purchases', { method: 'POST', body }); },

  // History
  listHistory(params = {}) {
    const qs = new URLSearchParams();
    if (params.type) qs.set('type', params.type);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/me/history${suffix}`);
  },

  // Recommendations (user_cf / co_bought).
  recommendForMe(params = {}, options = {}) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.formula) qs.set('formula', String(params.formula));
    if (params.includeViews) qs.set('includeViews', String(params.includeViews));
    if (params.excludeProductId) qs.set('excludeProductId', String(params.excludeProductId));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/recommendations/me${suffix}`, options);
  },
  recommendForProduct(productId, params = {}) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.formula) qs.set('formula', String(params.formula));
    if (params.includeViews) qs.set('includeViews', String(params.includeViews));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/recommendations/products/${encodeURIComponent(productId)}${suffix}`);
  },

  // Hybrid feed & Detail recommendations
  getHybridFeed(params = {}, options = {}) {
    const suffix = buildQuery(params);
    return request(`/api/recommendations/feed${suffix}`, options);
  },
  getDetailRecommendations(productId, params = {}, options = {}) {
    const suffix = buildQuery(params);
    return request(`/api/recommendations/detail/${encodeURIComponent(productId)}${suffix}`, options);
  },

  // Event logging
  recordSearch(body) { return request('/api/events/search', { method: 'POST', body }); },
  recordViewEvent(body) { return request('/api/events/view', { method: 'POST', body }); },
  recordImpression(body) { return request('/api/events/impression', { method: 'POST', body }); },
  recordRecoClick(body) { return request('/api/events/click', { method: 'POST', body }); },
  dismissRecommendation(body) { return request('/api/events/dismiss', { method: 'POST', body }); },
  undoDismiss(body) { return request('/api/events/undo-dismiss', { method: 'POST', body }); },

  // Search history
  listSearches() { return request('/api/me/searches'); },
  clearSearches() { return request('/api/me/searches', { method: 'DELETE' }); },
  deleteSearch(eventId) { return request(`/api/me/searches/${encodeURIComponent(eventId)}`, { method: 'DELETE' }); },

  // Recommendation graph & Offline evaluation (admin only).
  recommendationGraph(params = {}) {
    const qs = new URLSearchParams();
    if (params.customerId) qs.set('customerId', String(params.customerId));
    if (params.mode) qs.set('mode', String(params.mode));
    if (params.productId) qs.set('productId', String(params.productId));
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/analytics/recommendation-graph${suffix}`);
  },
  getGraphRecommendation(params = {}) {
    return this.recommendationGraph(params);
  },
  getOfflineEvaluation() {
    return request('/api/analytics/offline-evaluation');
  },
};

export const getGraphRecommendation = (params = {}) => api.recommendationGraph(params);
export const recommendationGraph = (params = {}) => api.recommendationGraph(params);
