// Maps Neo4j nodes/edges to whitelisted JSON for API responses. By default this
// strips passwordHash, salt, and datasetTag — never expose them on the wire.

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') {
    const s = value.toString();
    if (typeof s === 'string') return s;
  }
  return null;
}

export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return null;
  if (typeof value.toNumber === 'function') {
    try {
      return value.toNumber();
    } catch {
      return Number(value);
    }
  }
  return Number(value);
}

function getProps(obj) {
  if (!obj) return {};
  if (obj.properties) return obj.properties;
  return obj;
}

export function publicCustomer(props) {
  const p = getProps(props);
  return {
    customerId: p.customerId,
    name: p.name,
    email: p.email,
    role: p.role,
    active: p.active,
    createdAt: toIso(p.createdAt),
  };
}

export function publicProduct(props) {
  const p = getProps(props);
  return {
    productId: p.productId,
    name: p.name,
    brand: p.brand || null,
    model: p.model || null,
    description: p.description,
    price: toNumber(p.price),
    imageUrl: p.imageUrl,
    active: p.active,
    createdAt: toIso(p.createdAt),
    categoryId: p.categoryId,
    illustrationKey: p.illustrationKey || null,
  };
}

export function publicProductWithCategory(productNode, categoryNode) {
  const p = getProps(productNode);
  const c = categoryNode ? getProps(categoryNode) : null;
  return {
    ...publicProduct(p),
    categoryId: c ? c.categoryId : (p.categoryId || null),
  };
}

export function publicCategory(props) {
  const p = getProps(props);
  return {
    categoryId: p.categoryId,
    name: p.name,
    description: p.description,
  };
}

export function publicBoughtEdge(edge, product) {
  const props = getProps(edge);
  return {
    eventId: props.eventId,
    type: 'bought',
    productId: product ? product.productId : props.productId || null,
    productName: product ? product.name : null,
    productImageUrl: product ? product.imageUrl : null,
    productActive: product ? product.active : null,
    quantity: toNumber(props.quantity),
    unitPrice: toNumber(props.unitPrice),
    occurredAt: toIso(props.purchasedAt),
  };
}

export function publicViewedEdge(edge, product) {
  const props = getProps(edge);
  return {
    eventId: props.eventId,
    type: 'viewed',
    productId: product ? product.productId : null,
    productName: product ? product.name : null,
    productImageUrl: product ? product.imageUrl : null,
    productActive: product ? product.active : null,
    occurredAt: toIso(props.viewedAt),
  };
}

export function paginated(items, page, pageSize, total) {
  return {
    items,
    page,
    pageSize,
    total: typeof total === 'number' ? total : items.length,
  };
}
