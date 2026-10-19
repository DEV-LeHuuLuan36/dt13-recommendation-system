// Pure JavaScript Rule-Based Vietnamese Search Intent & Budget Parser
// Analyzes queries for product categories, brands, models, budget constraints, attributes, and negations.

import { removeVietnameseTones, normalizeSearchQuery } from './vietnamese.js';

export const PARSER_VERSION = 'v2.0-rule';

// Catalog knowledge dictionaries
export const CATEGORY_MAP = [
  {
    id: 'RC_CAT_SMARTPHONE',
    name: 'Điện thoại',
    keywords: ['dien thoai', 'điện thoại', 'smartphone', 'phone', 'di dong', 'di động', 'dienthoai', 'mobile', 'iphone', 'galaxy'],
  },
  {
    id: 'RC_CAT_LAPTOP',
    name: 'Laptop',
    keywords: ['laptop', 'may tinh xach tay', 'máy tính xách tay', 'macbook', 'notebook', 'maytinh', 'máy tính'],
  },
  {
    id: 'RC_CAT_HEADPHONES',
    name: 'Tai nghe',
    keywords: ['tai nghe', 'headphone', 'earphone', 'airpods', 'headset', 'tainghe', 'earbuds'],
  },
  {
    id: 'RC_CAT_MOUSE',
    name: 'Chuột',
    keywords: ['chuot', 'chuột', 'mouse', 'chuot may tinh', 'chuột máy tính'],
  },
  {
    id: 'RC_CAT_KEYBOARD',
    name: 'Bàn phím',
    keywords: ['ban phim', 'bàn phím', 'keyboard', 'banphim', 'phim co', 'phím cơ'],
  },
  {
    id: 'RC_CAT_TABLET',
    name: 'Máy tính bảng',
    keywords: ['may tinh bang', 'máy tính bảng', 'tablet', 'ipad', 'tab'],
  },
];

export const BRAND_LIST = [
  'Logitech G',
  'Logitech',
  'Apple',
  'Samsung',
  'Sony',
  'JBL',
  'Dell',
  'Sennheiser',
  'HP',
  'ASUS',
  'Lenovo',
  'Bose',
];

export const MODEL_LIST = [
  'iPhone 16', 'iPhone 15', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11', 'iPhone SE',
  'Galaxy S24', 'Galaxy S23', 'Galaxy S22', 'Galaxy S21',
  'Galaxy A55', 'Galaxy A35', 'Galaxy A25', 'Galaxy A15', 'Galaxy A05s', 'Galaxy A05',
  'MacBook Air', 'MacBook Pro', 'MacBook',
  'XPS 13', 'XPS 15', 'Inspiron 15', 'Inspiron 14',
  'WH-1000XM5', 'WH-1000XM4', 'AirPods Max', 'AirPods Pro', 'AirPods',
  'MX Master 3S', 'MX Master 3', 'MX Anywhere 3S', 'G502',
];

/**
 * Regex matching price units in Vietnamese:
 * - triệu, trieu, tr, tr5...
 * - k, nghin, nghìn, ngan, ngàn
 * - tỷ, ty
 * - đ, vnd, vnđ
 */
const UNIT_REGEX_STR = '(?:triệu|trieu|tr\\b|nghìn|nghin|ngàn|ngan|k\\b|đ|vnd|vnđ)';

/**
 * Parses Vietnamese numeric string representation of prices into integer VND.
 * Handles: 5tr, 5tr5, 5,5 triệu, 5.5 triệu, 500k, 5000000, 5.000.000đ, etc.
 */
export function parsePriceValue(str, sharedUnit = null) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim().toLowerCase().replace(/[đvnđ]/g, '').trim();

  // Pattern: 5tr5, 5tr500, 5tr05
  const trShorthand = s.match(/^(\d+)\s*tr\s*(\d+)$/);
  if (trShorthand) {
    const main = Number.parseInt(trShorthand[1], 10);
    const subStr = trShorthand[2];
    const subVal = Number.parseInt(subStr, 10);
    const multiplier = subStr.length === 1 ? 100000 : (subStr.length === 2 ? 10000 : 1000);
    return Math.round(main * 1000000 + subVal * multiplier);
  }

  // Pattern: 5,5 triệu, 5.5 triệu, 5 triệu, 5tr
  const trMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr)$/);
  if (trMatch) {
    const num = Number.parseFloat(trMatch[1].replace(',', '.'));
    if (!Number.isNaN(num)) return Math.round(num * 1000000);
  }

  // Pattern: 500k, 50k, 500 nghìn, 500 ngàn
  const kMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|nghin|ngàn|ngan)$/);
  if (kMatch) {
    const num = Number.parseFloat(kMatch[1].replace(',', '.'));
    if (!Number.isNaN(num)) return Math.round(num * 1000);
  }

  // Pattern: Formatted full number like 5.000.000 or 5000000
  const cleanNumber = s.replace(/[.,]/g, '');
  if (/^\d+$/.test(cleanNumber)) {
    const num = Number.parseInt(cleanNumber, 10);
    if (num >= 10000) return num;
    // If number is small (e.g. 4 in "từ 4 đến 6 triệu") and sharedUnit is present:
    if (sharedUnit) {
      if (/triệu|trieu|tr/i.test(sharedUnit)) return Math.round(num * 1000000);
      if (/k|nghìn|nghin|ngàn|ngan/i.test(sharedUnit)) return Math.round(num * 1000);
    }
  }

  return null;
}

/**
 * Protects model names and specifications from being accidentally parsed as prices.
 */
function maskProtectedTokens(text) {
  const protectedItems = [];
  let masked = text;

  // Protect known models (e.g. iPhone 15, XPS 13, Galaxy S23)
  for (const model of MODEL_LIST) {
    const re = new RegExp(`\\b${model.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    masked = masked.replace(re, (m) => {
      const token = `__PROT_${protectedItems.length}__`;
      protectedItems.push({ token, original: m, type: 'model' });
      return token;
    });
  }

  // Protect generic model numbers: iPhone 11..16, Galaxy S20..S24, A05..A55, M1..M3
  masked = masked.replace(/\b(iphone|galaxy|xps|inspiron|airpods|macbook)\s*([a-z0-9]+)\b/gi, (m) => {
    const token = `__PROT_${protectedItems.length}__`;
    protectedItems.push({ token, original: m, type: 'model' });
    return token;
  });

  // Protect explicit prefix RAM specs first: RAM 8GB
  masked = masked.replace(/\bram\s+(\d+)\s*gb\b/gi, (m) => {
    const token = `__PROT_${protectedItems.length}__`;
    protectedItems.push({ token, original: m.trim(), type: 'attribute', key: 'ram' });
    return token;
  });

  // Protect explicit suffix RAM specs: 8GB RAM, 16GB RAM (capped at 64GB)
  masked = masked.replace(/\b(\d+)\s*gb\s+ram\b/gi, (m, num) => {
    const n = Number.parseInt(num, 10);
    if (n <= 64) {
      const token = `__PROT_${protectedItems.length}__`;
      protectedItems.push({ token, original: m.trim(), type: 'attribute', key: 'ram' });
      return token;
    }
    return m;
  });

  // Protect battery specs: pin 5000mAh or 5000mAh
  masked = masked.replace(/\b(?:pin\s+)?(\d+)\s*mah\b/gi, (m) => {
    const token = `__PROT_${protectedItems.length}__`;
    protectedItems.push({ token, original: m.trim(), type: 'attribute', key: 'battery' });
    return token;
  });

  // Protect standalone GB: 64GB, 128GB, 256GB, 512GB (storage) or <= 32GB (ram)
  masked = masked.replace(/\b(\d+)\s*gb\b/gi, (m, num) => {
    const token = `__PROT_${protectedItems.length}__`;
    const n = Number.parseInt(num, 10);
    const key = (n >= 64 || /64|128|256|512/.test(num)) ? 'storage' : 'ram';
    protectedItems.push({ token, original: m.trim(), type: 'attribute', key });
    return token;
  });

  masked = masked.replace(/\b(\d+)\s*(?:tb|ssd|hdd)\b/gi, (m) => {
    const token = `__PROT_${protectedItems.length}__`;
    protectedItems.push({ token, original: m, type: 'attribute', key: 'storage' });
    return token;
  });

  masked = masked.replace(/\b(\d+(?:[.,]\d+)?)\s*(?:inch|in)\b/gi, (m) => {
    const token = `__PROT_${protectedItems.length}__`;
    protectedItems.push({ token, original: m, type: 'attribute', key: 'screenSize' });
    return token;
  });

  return { masked, protectedItems };
}

/**
 * Unmasks protected tokens back into plain text.
 */
function unmaskTokens(text, protectedItems) {
  let res = text;
  for (const item of protectedItems) {
    res = res.replace(new RegExp(item.token, 'g'), item.original);
  }
  return res;
}

/**
 * Parses Vietnamese search query into a structured Intent object.
 */
export function parseSearchIntent(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return {
      category: null,
      categories: [],
      brands: [],
      excludedBrands: [],
      model: null,
      attributes: {},
      minPrice: null,
      maxPrice: null,
      targetPrice: null,
      inclusiveMin: true,
      inclusiveMax: true,
      currency: 'VND',
      budgetScope: 'single',
      items: [],
      unrecognized: [],
      hasConflict: false,
      conflictReason: null,
      rawQuery: '',
      cleanedQuery: '',
      normalizedQuery: '',
      parserVersion: PARSER_VERSION,
    };
  }

  const query = rawQuery.trim().slice(0, 150);
  const normalizedText = removeVietnameseTones(query).toLowerCase();

  // 1. Check for bundle total
  const isBundleTotal = /(?:tong\s*(?:cong|khong\s*qua|duoi|toi\s*da)?|ca\s*(?:hai|2)\s*(?:khong\s*qua|duoi|toi\s*da)?|tong)/i.test(normalizedText);

  // 2. Protect models and specs from false number parsing
  const { masked, protectedItems } = maskProtectedTokens(query);

  let minPrice = null;
  let maxPrice = null;
  let targetPrice = null;
  let inclusiveMin = true;
  let inclusiveMax = true;
  let pricePhrase = '';
  let hasConflict = false;
  let conflictReason = null;

  // 3. Multi-item budget pattern check (e.g. "điện thoại dưới 5 triệu, tai nghe dưới 500k")
  const multiItemMatches = [];
  const commaParts = query.split(/[,;\n]|(?:\bva\b|\bvà\b)/i);
  if (commaParts.length >= 2 && !isBundleTotal) {
    for (const part of commaParts) {
      const subIntent = parseSearchIntent(part);
      if (subIntent.category && (subIntent.minPrice !== null || subIntent.maxPrice !== null || subIntent.targetPrice !== null)) {
        multiItemMatches.push({
          category: subIntent.category,
          minPrice: subIntent.minPrice,
          maxPrice: subIntent.maxPrice,
          targetPrice: subIntent.targetPrice,
          inclusiveMin: subIntent.inclusiveMin,
          inclusiveMax: subIntent.inclusiveMax,
          rawPart: part.trim(),
        });
      }
    }
  }

  // 4. Detect Range: "từ X đến Y", "từ X tới Y", "X - Y"
  const rangeRegex = new RegExp(
    `(?:tu|từ)\\s+([\\d.,]+(?:\\s*${UNIT_REGEX_STR})?)\\s+(?:den|đến|toi|tới|-)\\s+([\\d.,]+(?:\\s*${UNIT_REGEX_STR})?)`,
    'i'
  );
  const rangeMatch = masked.match(rangeRegex);

  if (rangeMatch) {
    const rawVal1 = rangeMatch[1].trim();
    const rawVal2 = rangeMatch[2].trim();
    const val2 = parsePriceValue(rawVal2);
    // If rawVal1 lacks unit, infer unit from rawVal2
    const val1 = parsePriceValue(rawVal1, rawVal2);

    if (val1 && val2) {
      if (val1 > val2) {
        // Conflicting condition: e.g. "từ 7 triệu đến 4 triệu"
        hasConflict = true;
        conflictReason = `Khoảng giá mâu thuẫn: tối thiểu (${val1.toLocaleString('vi-VN')}đ) lớn hơn tối đa (${val2.toLocaleString('vi-VN')}đ).`;
      } else {
        minPrice = val1;
        maxPrice = val2;
        inclusiveMin = true;
        inclusiveMax = true;
        pricePhrase = rangeMatch[0];
      }
    }
  }

  // 5. Detect Target price: "khoảng 5 triệu", "tầm 5 triệu", "giá 5 triệu", "quanh 5tr"
  if (!minPrice && !maxPrice && !hasConflict) {
    const targetRegex = new RegExp(
      `(?:khoang|khoảng|tam|tầm|tam\\s*gia|tầm\\s*giá|quanh|xung\\s*quanh|gia|giá)\\s+([\\d.,]+(?:\\s*${UNIT_REGEX_STR}))`,
      'i'
    );
    const targetMatch = masked.match(targetRegex);
    if (targetMatch) {
      const val = parsePriceValue(targetMatch[1]);
      if (val) {
        targetPrice = val;
        // Configurable initial range around target price (default +-12% to cover common retailer price points like 4.49M around 5M)
        const margin = 0.12;
        minPrice = Math.round(val * (1 - margin));
        maxPrice = Math.round(val * (1 + margin));
        inclusiveMin = true;
        inclusiveMax = true;
        pricePhrase = targetMatch[0];
      }
    }
  }

  // 6. Detect Max price (Upper bound): "dưới 5 triệu" (<), "tối đa 5 triệu" (<=), "không quá 5 triệu" (<=)
  if (!minPrice && !maxPrice && !targetPrice && !hasConflict) {
    const maxStrictRegex = new RegExp(
      `(?:duoi|dưới|nho\\s*hon|nhỏ\\s*hơn|thap\\s*hon|thấp\\s*hơn|under|less\\s*than)\\s+([\\d.,]+(?:\\s*${UNIT_REGEX_STR}))`,
      'i'
    );
    const maxStrictMatch = masked.match(maxStrictRegex);
    if (maxStrictMatch) {
      const val = parsePriceValue(maxStrictMatch[1]);
      if (val) {
        maxPrice = val;
        inclusiveMax = false;
        pricePhrase = maxStrictMatch[0];
      }
    } else {
      const maxInclusiveRegex = new RegExp(
        `(?:toi\\s*da|tối\\s*đa|khong\\s*qua|không\\s*quá|ko\\s*qua|ko\\s*quá|khong\\s*vuot\\s*qua|be\\s*hon\\s*hoac\\s*bang|bé\\s*hơn\\s*hoặc\\s*bằng|max)\\s+([\\d.,]+(?:\\s*${UNIT_REGEX_STR}))`,
        'i'
      );
      const maxInclusiveMatch = masked.match(maxInclusiveRegex);
      if (maxInclusiveMatch) {
        const val = parsePriceValue(maxInclusiveMatch[1]);
        if (val) {
          maxPrice = val;
          inclusiveMax = true;
          pricePhrase = maxInclusiveMatch[0];
        }
      }
    }
  }

  // 7. Detect Min price (Lower bound): "trên 5 triệu" (>), "tối thiểu 5 triệu" (>=)
  if (!minPrice && !targetPrice && !hasConflict) {
    const minStrictRegex = new RegExp(
      `(?:tren|trên|lon\\s*hon|lớn\\s*hơn|cao\\s*hon|cao\\s*hơn|hon|hơn|over|more\\s*than)\\s+([\\d.,]+(?:\\s*${UNIT_REGEX_STR}))`,
      'i'
    );
    const minStrictMatch = masked.match(minStrictRegex);
    if (minStrictMatch) {
      const val = parsePriceValue(minStrictMatch[1]);
      if (val) {
        minPrice = val;
        inclusiveMin = false;
        pricePhrase = pricePhrase ? `${pricePhrase} ${minStrictMatch[0]}` : minStrictMatch[0];
      }
    } else {
      const minInclusiveRegex = new RegExp(
        `(?:toi\\s*thieu|tối\\s*thiểu|it\\s*nhat|ít\\s*nhất|khong\\s*duoi|không\\s*dưới|min)\\s+([\\d.,]+(?:\\s*${UNIT_REGEX_STR}))`,
        'i'
      );
      const minInclusiveMatch = masked.match(minInclusiveRegex);
      if (minInclusiveMatch) {
        const val = parsePriceValue(minInclusiveMatch[1]);
        if (val) {
          minPrice = val;
          inclusiveMin = true;
          pricePhrase = pricePhrase ? `${pricePhrase} ${minInclusiveMatch[0]}` : minInclusiveMatch[0];
        }
      }
    }
  }

  // 8. Standalone price fallback: e.g. "laptop 5tr5", "laptop 5,5 triệu", "laptop 5.000.000đ"
  if (!minPrice && !maxPrice && !targetPrice && !hasConflict) {
    const standaloneRegex = /\b(\d+\s*tr\s*\d+|\d+(?:[.,]\d+)?\s*(?:triệu|trieu|tr\b|k\b|nghìn|nghin|ngàn|ngan)|\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|vnd|vnđ))?)\b/i;
    const standaloneMatch = masked.match(standaloneRegex);
    if (standaloneMatch) {
      const val = parsePriceValue(standaloneMatch[1]);
      if (val) {
        targetPrice = val;
        minPrice = Math.round(val * 0.9);
        maxPrice = Math.round(val * 1.1);
        inclusiveMin = true;
        inclusiveMax = true;
        pricePhrase = standaloneMatch[0];
      }
    }
  }

  // 9. Detect Negated Brands (e.g. "không Samsung", "ko apple", "trừ dell", "ngoại trừ sony")
  const excludedBrands = [];
  for (const b of BRAND_LIST) {
    const bNorm = removeVietnameseTones(b).toLowerCase();
    const negPattern = new RegExp(`(?:khong|không|ko|k|tru|trừ|bo|bỏ|ngoai\\s*tru|ngoại\\s*trừ)\\s+${bNorm}\\b`, 'i');
    if (negPattern.test(normalizedText)) {
      excludedBrands.push(b);
    }
  }

  // 10. Detect Requested Brands (excluding negated ones)
  const brands = [];
  for (const b of BRAND_LIST) {
    if (excludedBrands.includes(b)) continue;
    const bNorm = removeVietnameseTones(b).toLowerCase();
    const brandPattern = new RegExp(`\\b${bNorm}\\b`, 'i');
    if (brandPattern.test(normalizedText)) {
      brands.push(b);
    }
  }

  // 11. Detect Category
  let detectedCategory = null;
  const detectedCategories = [];
  for (const cat of CATEGORY_MAP) {
    for (const kw of cat.keywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText)) {
        if (!detectedCategories.find((c) => c.id === cat.id)) {
          detectedCategories.push(cat);
        }
        break;
      }
    }
  }

  // Infer category from model or brand if not explicitly found in keywords
  if (detectedCategories.length === 0) {
    if (/\b(?:iphone|galaxy\s*a|galaxy\s*s)\b/i.test(normalizedText)) {
      const phoneCat = CATEGORY_MAP.find((c) => c.id === 'RC_CAT_SMARTPHONE');
      if (phoneCat) detectedCategories.push(phoneCat);
    } else if (/\b(?:macbook|xps|inspiron)\b/i.test(normalizedText)) {
      const laptopCat = CATEGORY_MAP.find((c) => c.id === 'RC_CAT_LAPTOP');
      if (laptopCat) detectedCategories.push(laptopCat);
    } else if (/\b(?:airpods|wh-1000xm\d)\b/i.test(normalizedText)) {
      const hpCat = CATEGORY_MAP.find((c) => c.id === 'RC_CAT_HEADPHONES');
      if (hpCat) detectedCategories.push(hpCat);
    } else if (/\b(?:mx\s*master|mx\s*anywhere|g502)\b/i.test(normalizedText)) {
      const mouseCat = CATEGORY_MAP.find((c) => c.id === 'RC_CAT_MOUSE');
      if (mouseCat) detectedCategories.push(mouseCat);
    }
  }

  if (detectedCategories.length > 0) {
    detectedCategory = detectedCategories[0];
  }

  // 12. Extract Attributes and Models from protected tokens
  let detectedModel = null;
  const attributes = {};
  for (const item of protectedItems) {
    if (item.type === 'model' && !detectedModel) {
      detectedModel = item.original;
    } else if (item.type === 'attribute') {
      attributes[item.key] = item.original;
    }
  }

  // 13. Cleaned keyword query for catalog text matching (strip price phrase)
  let cleaned = masked;
  if (pricePhrase) {
    const escaped = pricePhrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`${escaped}(?:\\s*(?:đ|vnd|vnđ))?`, 'i'), ' ');
  }
  cleaned = unmaskTokens(cleaned, protectedItems);
  const cleanedQuery = cleaned.replace(/\s+/g, ' ').trim();
  const normalizedQuery = normalizeSearchQuery(cleanedQuery);

  // 14. Budget scope determination
  let budgetScope = 'single';
  if (isBundleTotal && detectedCategories.length >= 2) {
    budgetScope = 'bundle_total';
  } else if (multiItemMatches.length >= 2) {
    budgetScope = 'multi_item';
  }

  return {
    category: detectedCategory ? { id: detectedCategory.id, name: detectedCategory.name } : null,
    categories: detectedCategories.map((c) => ({ id: c.id, name: c.name })),
    brands,
    excludedBrands,
    model: detectedModel,
    attributes,
    minPrice,
    maxPrice,
    targetPrice,
    inclusiveMin,
    inclusiveMax,
    currency: 'VND',
    budgetScope,
    items: multiItemMatches,
    itemsBudget: multiItemMatches,
    pricePhrase: pricePhrase.trim(),
    hasConflict,
    conflictReason,
    unclearCondition: hasConflict,
    unclearReason: conflictReason,
    rawQuery: query,
    cleanedQuery,
    normalizedQuery,
    parserVersion: PARSER_VERSION,
  };
}
