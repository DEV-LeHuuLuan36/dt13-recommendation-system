// Technical SEO & Structured Data (JSON-LD) Utility
const SITE_NAME = 'DT13 Store - Hệ thống Gợi ý Neo4j';
const DEFAULT_DESC = 'DT13 Store - Nền tảng thương mại điện tử công nghệ tích hợp hệ thống gợi ý sản phẩm thông minh bằng Neo4j Graph Database và Collaborative Filtering.';
const DEFAULT_IMAGE = '/favicon.svg';

/**
 * Set formatted document title
 * @param {string} pageTitle
 */
export function setDocumentTitle(pageTitle) {
  if (typeof document === 'undefined') return;
  if (!pageTitle) {
    document.title = SITE_NAME;
    return;
  }
  if (pageTitle.includes(SITE_NAME)) {
    document.title = pageTitle;
  } else {
    document.title = `${pageTitle} | ${SITE_NAME}`;
  }
}

/**
 * Set standard meta description (120-160 chars)
 * @param {string} text
 */
export function setMetaDescription(text) {
  if (typeof document === 'undefined') return;
  let desc = (text || DEFAULT_DESC).trim().replace(/\s+/g, ' ');
  if (desc.length > 160) {
    desc = `${desc.slice(0, 157)}...`;
  }
  let el = document.querySelector('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'description');
    document.head.appendChild(el);
  }
  el.setAttribute('content', desc);
  setOpenGraph({ description: desc });
}

/**
 * Set robots meta tag
 * @param {'index, follow' | 'noindex, nofollow'} content
 */
export function setMetaRobots(content) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('meta[name="robots"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Set canonical URL link tag
 * @param {string} [url]
 */
export function setCanonicalUrl(url) {
  if (typeof document === 'undefined') return;
  const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', targetUrl);
  setOpenGraph({ url: targetUrl });
}

/**
 * Helper to update Open Graph and Twitter Card tags
 * @param {{ title?: string, description?: string, image?: string, url?: string, type?: string }} param0
 */
export function setOpenGraph({ title, description, image, url, type = 'website' }) {
  if (typeof document === 'undefined') return;

  function updateTag(property, content, isName = false) {
    if (!content) return;
    const attr = isName ? 'name' : 'property';
    let el = document.querySelector(`meta[${attr}="${property}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  if (title) {
    updateTag('og:title', title);
    updateTag('twitter:title', title, true);
  }
  if (description) {
    updateTag('og:description', description);
    updateTag('twitter:description', description, true);
  }
  if (image) {
    updateTag('og:image', image);
    updateTag('twitter:image', image, true);
  }
  if (url) {
    updateTag('og:url', url);
  }
  if (type) {
    updateTag('og:type', type);
  }
}

/**
 * Injects or updates JSON-LD structured data in the document head
 * @param {object|null} schemaData
 */
export function setStructuredData(schemaData) {
  if (typeof document === 'undefined') return;
  let script = document.getElementById('dt13-jsonld');
  if (!schemaData) {
    if (script) script.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = 'dt13-jsonld';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schemaData);
}

/**
 * Generates Schema.org for ProductList (WebSite + SearchAction + ItemList)
 * @param {Array<{ productId: string, name: string, price: number, imageUrl?: string, brand?: string }>} products
 * @param {string} [categoryName]
 */
export function setProductListStructuredData(products = [], categoryName = '') {
  if (typeof window === 'undefined') return;
  const origin = window.location.origin;
  const currentUrl = window.location.href;

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DT13 Store',
    url: origin,
    description: DEFAULT_DESC,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: categoryName ? `Danh mục ${categoryName} - DT13 Store` : 'Danh sách sản phẩm công nghệ - DT13 Store',
    url: currentUrl,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 24).map((p, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: p.name,
      url: `${origin}/?view=product&id=${encodeURIComponent(p.productId)}`,
      image: p.imageUrl || `${origin}${DEFAULT_IMAGE}`,
    })),
  };

  setStructuredData([websiteSchema, itemListSchema]);
}

/**
 * Generates Schema.org for ProductDetail (Product + Offer + BreadcrumbList)
 * @param {{ productId: string, name: string, price: number, description?: string, imageUrl?: string, brand?: string, active?: boolean }} product
 * @param {string} [categoryName]
 */
export function setProductDetailStructuredData(product, categoryName = '') {
  if (typeof window === 'undefined' || !product) return;
  const origin = window.location.origin;
  const currentUrl = window.location.href;

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.productId,
    mpn: product.productId,
    image: product.imageUrl ? [product.imageUrl] : [`${origin}${DEFAULT_IMAGE}`],
    description: product.description || `${product.name} chính hãng tại DT13 Store.`,
    brand: {
      '@type': 'Brand',
      name: product.brand || 'DT13 Store',
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'VND',
      price: product.price,
      url: currentUrl,
      itemCondition: 'https://schema.org/NewCondition',
      availability: product.active !== false
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'DT13 Store',
      },
    },
  };

  const breadcrumbs = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Trang chủ',
      item: `${origin}/?view=products`,
    },
  ];

  if (categoryName) {
    breadcrumbs.push({
      '@type': 'ListItem',
      position: 2,
      name: categoryName,
      item: `${origin}/?view=products&category=${encodeURIComponent(product.categoryId || '')}`,
    });
  }

  breadcrumbs.push({
    '@type': 'ListItem',
    position: breadcrumbs.length + 1,
    name: product.name,
    item: currentUrl,
  });

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs,
  };

  setStructuredData([productSchema, breadcrumbSchema]);
}
