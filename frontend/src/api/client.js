// Frontend API client with isomorphic fetch wrapper and session handling.
const API_BASE = '';

function buildQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || data.message || `Loi HTTP ${res.status}`);
    err.status = res.status;
    err.code = (data && data.error && data.error.code) || data.code;
    err.details = (data && data.error && data.error.details) || data.details;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  me() { return request('/api/auth/me'); },
  login(body) { return request('/api/auth/login', { method: 'POST', body }); },
  logout() { return request('/api/auth/logout', { method: 'POST' }); },

  // Products
  listProducts(params = {}, options = {}) {
    const suffix = buildQuery(params);
    return request(`/api/products${suffix}`, options);
  },
  getProduct(productId, params = {}) {
    const suffix = buildQuery(params);
    return request(`/api/products/${encodeURIComponent(productId)}${suffix}`);
  },
  buyProduct(productId) {
    return request(`/api/products/${encodeURIComponent(productId)}/buy`, { method: 'POST' });
  },

  // Interactions (Customer views & purchases)
  recordView(body) {
    return request('/api/interactions/views', { method: 'POST', body }).catch((err) => {
      if (err.status === 401 || err.status === 403) {
        return request('/api/events/view', { method: 'POST', body });
      }
      throw err;
    });
  },
  recordPurchase(body) {
    return request('/api/interactions/purchases', { method: 'POST', body });
  },

  // Categories
  listCategories() { return request('/api/categories'); },

  // Admin CRUD Products
  adminCreateProduct(body) { return request('/api/admin/products', { method: 'POST', body }); },
  createProduct(body) { return this.adminCreateProduct(body); },
  adminUpdateProduct(productId, body) {
    return request(`/api/admin/products/${encodeURIComponent(productId)}`, { method: 'PUT', body });
  },
  updateProduct(productId, body) { return this.adminUpdateProduct(productId, body); },
  adminDeleteProduct(productId) {
    return request(`/api/admin/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
  },
  deleteProduct(productId) { return this.adminDeleteProduct(productId); },

  // Admin CRUD Categories
  adminCreateCategory(body) { return request('/api/admin/categories', { method: 'POST', body }); },
  createCategory(body) { return this.adminCreateCategory(body); },
  adminUpdateCategory(categoryId, body) {
    return request(`/api/admin/categories/${encodeURIComponent(categoryId)}`, { method: 'PUT', body });
  },
  updateCategory(categoryId, body) { return this.adminUpdateCategory(categoryId, body); },
  adminDeleteCategory(categoryId) {
    return request(`/api/admin/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' });
  },
  deleteCategory(categoryId) { return this.adminDeleteCategory(categoryId); },

  // Admin CRUD Customers
  adminListCustomers(params = {}) {
    const suffix = buildQuery(params);
    return request(`/api/admin/customers${suffix}`);
  },
  listCustomers(params = {}) {
    return this.adminListCustomers(params);
  },
  adminCreateCustomer(body) { return request('/api/admin/customers', { method: 'POST', body }); },
  createCustomer(body) { return this.adminCreateCustomer(body); },
  adminUpdateCustomer(customerId, body) {
    return request(`/api/admin/customers/${encodeURIComponent(customerId)}`, { method: 'PUT', body });
  },
  updateCustomer(customerId, body) { return this.adminUpdateCustomer(customerId, body); },
  adminDeleteCustomer(customerId) {
    return request(`/api/admin/customers/${encodeURIComponent(customerId)}`, { method: 'DELETE' });
  },
  deleteCustomer(customerId) { return this.adminDeleteCustomer(customerId); },

  // History
  getMyHistory(params = {}) {
    const suffix = buildQuery(params);
    return request(`/api/me/history${suffix}`);
  },
  listHistory(params = {}) {
    return this.getMyHistory(params);
  },

  // Recommendations (user_cf / co_bought).
  recommendForMe(params = {}, options = {}) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.formula) qs.set('formula', String(params.formula));
    if (params.includeViews) qs.set('includeViews', String(params.includeViews));
    if (params.excludeProductId) qs.set('excludeProductId', String(params.excludeProductId));
    if (params.demoCustomerId) qs.set('demoCustomerId', String(params.demoCustomerId));
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

  // Trending & Cross-Category
  getTrending(params = {}, options = {}) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/recommendations/trending${suffix}`, options);
  },
  getCrossCategory(params = {}, options = {}) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.customerId) qs.set('customerId', String(params.customerId));
    if (params.demoCustomerId) qs.set('demoCustomerId', String(params.demoCustomerId));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/recommendations/cross-category${suffix}`, options);
  },

  // Hybrid feed & Detail recommendations
  getHybridFeed(params = {}, options = {}) {
    const suffix = buildQuery(params);
    return request(`/api/recommendations/feed${suffix}`, options);
  },
  getDetailRecommendations(productId, params = {}, options = {}) {
    let pId = productId;
    let qParams = params;
    if (productId && typeof productId === 'object') {
      pId = productId.productId;
      const { productId: _unused, ...rest } = productId;
      qParams = rest;
    }
    const suffix = buildQuery(qParams);
    return request(`/api/recommendations/detail/${encodeURIComponent(pId)}${suffix}`, options);
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
  getGraphStats() {
    return request('/api/analytics/graph-stats');
  },
  getNeo4jHealth() {
    return request('/api/health/neo4j');
  },
};

export const getGraphRecommendation = (params = {}) => api.recommendationGraph(params);
export const recommendationGraph = (params = {}) => api.recommendationGraph(params);
