import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { setCanonicalUrl, setDocumentTitle, setMetaDescription, setProductListStructuredData } from '../utils/seo.js';
import { newEventId, getVisitId } from '../utils/eventId.js';
import ProductCard from './ProductCard.jsx';
import Recommendations from './Recommendations.jsx';
import '../styles/ProductList.css';

const SORT_OPTIONS = [
  { key: '', label: 'Phù hợp nhất' },
  { key: 'price_asc', label: 'Giá: Thấp đến Cao' },
  { key: 'price_desc', label: 'Giá: Cao đến Thấp' },
  { key: 'name_asc', label: 'Tên: A đến Z' },
  { key: 'name_desc', label: 'Tên: Z đến A' },
  { key: 'newest', label: 'Mới nhất' },
];

const PRICE_PRESETS = [
  { key: 'all', label: 'Tất cả giá', min: '', max: '' },
  { key: 'u5', label: 'Dưới 5 triệu', min: 0, max: 5_000_000 },
  { key: '5to15', label: '5 - 15 triệu', min: 5_000_000, max: 15_000_000 },
  { key: '15to30', label: '15 - 30 triệu', min: 15_000_000, max: 30_000_000 },
  { key: 'o30', label: 'Trên 30 triệu', min: 30_000_000, max: '' },
];

const POPULAR_BRANDS = [
  'Apple',
  'ASUS',
  'Dell',
  'Lenovo',
  'HP',
  'Samsung',
  'Sony',
  'Logitech',
  'Logitech G',
  'Bose',
  'JBL',
  'Sennheiser',
];

function formatIntentBudgetChip(intent) {
  if (!intent) return null;
  const fmt = (n) => {
    if (n >= 1_000_000) {
      const tr = n / 1_000_000;
      return Number.isInteger(tr) ? `${tr} triệu` : `${tr.toFixed(1)} triệu`;
    }
    if (n >= 1_000) {
      return `${n / 1_000}k`;
    }
    return `${n}đ`;
  };
  if (intent.targetPrice) {
    return `Quanh ${fmt(intent.targetPrice)}`;
  }
  if (intent.minPrice && intent.maxPrice) {
    return `Từ ${fmt(intent.minPrice)} đến ${fmt(intent.maxPrice)}`;
  }
  if (intent.maxPrice) {
    return intent.inclusiveMax ? `Tối đa ${fmt(intent.maxPrice)}` : `Dưới ${fmt(intent.maxPrice)}`;
  }
  if (intent.minPrice) {
    return intent.inclusiveMin ? `Từ ${fmt(intent.minPrice)}` : `Trên ${fmt(intent.minPrice)}`;
  }
  return null;
}

function readUrlParams() {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get('q') || '',
    categoryId: sp.get('category') || sp.get('categoryId') || '',
    brand: sp.get('brand') || '',
    sort: sp.get('sort') || '',
    priceMin: sp.get('priceMin') || '',
    priceMax: sp.get('priceMax') || '',
    page: Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1),
  };
}

function writeUrlParams(state) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);
  sp.set('view', 'products');

  if (state.q) sp.set('q', state.q); else sp.delete('q');
  if (state.categoryId) sp.set('category', state.categoryId); else sp.delete('category');
  if (state.brand) sp.set('brand', state.brand); else sp.delete('brand');
  if (state.sort) sp.set('sort', state.sort); else sp.delete('sort');
  if (state.priceMin) sp.set('priceMin', state.priceMin); else sp.delete('priceMin');
  if (state.priceMax) sp.set('priceMax', state.priceMax); else sp.delete('priceMax');
  if (state.page > 1) sp.set('page', String(state.page)); else sp.delete('page');

  const qs = sp.toString();
  const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  if (next !== window.location.pathname + window.location.search) {
    window.history.pushState(null, '', next);
  }
}

export default function ProductList({
  profile,
  onSelectProduct,
  recoRefreshKey = 0,
  onCategoriesLoaded,
  initialCategoryId = null,
}) {
  const isAdmin = profile && profile.role === 'admin';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const initial = useMemo(
    () => readUrlParams() || { q: '', categoryId: initialCategoryId || '', brand: '', sort: '', priceMin: '', priceMax: '', page: 1 },
    [initialCategoryId]
  );

  const [qInput, setQInput] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [categoryId, setCategoryId] = useState(initialCategoryId || initial.categoryId);
  const [brand, setBrand] = useState(initial.brand);
  const [sort, setSort] = useState(initial.sort);
  const [priceMinInput, setPriceMinInput] = useState(initial.priceMin);
  const [priceMaxInput, setPriceMaxInput] = useState(initial.priceMax);
  const [priceMin, setPriceMin] = useState(initial.priceMin);
  const [priceMax, setPriceMax] = useState(initial.priceMax);
  const [page, setPage] = useState(initial.page);
  const [pageSize] = useState(12);

  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState(POPULAR_BRANDS);
  const [includeInactive] = useState(false);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [showFilters, setShowFilters] = useState(false);

  // Intent returned from search API
  const [serverIntent, setServerIntent] = useState(null);
  const [emptyMessage, setEmptyMessage] = useState('');

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const searchWrapRef = useRef(null);

  const abortRef = useRef(null);
  const requestSeq = useRef(0);
  const debounceRef = useRef(null);
  const lastRecordedSearchRef = useRef('');

  // Synchronize effective category & brand with inferred intent if user hasn't explicitly set them
  const effectiveCategoryId = categoryId || serverIntent?.category?.id || '';
  const effectiveBrand = brand || (serverIntent?.brands && serverIntent.brands.length > 0 ? serverIntent.brands[0] : '');

  // Log search intent event to Neo4j
  const recordSearchIntent = useCallback((query) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed === lastRecordedSearchRef.current) return;
    lastRecordedSearchRef.current = trimmed;
    const evtId = newEventId('srch');
    const visitId = getVisitId();
    api.recordSearch({ eventId: evtId, query: trimmed, visitId }).catch(() => {});
  }, []);

  // Fetch recent searches
  const loadRecentSearches = useCallback(async () => {
    try {
      const res = await api.listRecentSearches({ limit: 8 });
      setRecentSearches(res.items || []);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    loadRecentSearches();
  }, [loadRecentSearches]);

  // Click outside to close autocomplete
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Sync category jump from Header category strip
  useEffect(() => {
    function handleJump(e) {
      const cId = e.detail?.categoryId || '';
      setCategoryId(cId);
      setPage(1);
    }
    window.addEventListener('dt13:jump-category', handleJump);
    return () => window.removeEventListener('dt13:jump-category', handleJump);
  }, []);

  // Write state to URL
  useEffect(() => {
    writeUrlParams({ q, categoryId, brand, sort, priceMin, priceMax, page });
  }, [q, categoryId, brand, sort, priceMin, priceMax, page]);

  // Debounce search input
  useEffect(() => {
    if (qInput === q) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setQ(qInput);
      if (qInput.trim()) {
        recordSearchIntent(qInput);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [qInput, q, recordSearchIntent]);

  // Reset page when manual filters change
  useEffect(() => {
    setPage(1);
  }, [categoryId, brand, sort, priceMin, priceMax]);

  // Fetch product data
  const fetchData = useCallback(async () => {
    const mySeq = ++requestSeq.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus({ kind: 'loading', error: null });

    try {
      const params = {
        page,
        pageSize,
        includeInactive: isAdmin && includeInactive,
      };
      if (q) params.q = q;
      if (categoryId) params.categoryId = categoryId;
      if (brand) params.brand = brand;
      if (sort) params.sort = sort;
      if (priceMin !== '') params.priceMin = priceMin;
      if (priceMax !== '') params.priceMax = priceMax;

      const data = await api.listProducts(params, { signal: ctrl.signal });
      if (mySeq !== requestSeq.current) return;

      setItems(data.items || []);
      setTotal(data.total || 0);
      setServerIntent(data.intent || null);
      setEmptyMessage(data.message || '');
      setStatus({ kind: 'ready', error: null });

      const selectedCat = categories.find((c) => c.categoryId === (categoryId || data.intent?.category?.id));
      setProductListStructuredData(data.items, selectedCat?.name);
    } catch (err) {
      if (ctrl.signal.aborted || mySeq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message || 'Lỗi kết nối máy chủ.' });
      setItems([]);
      setTotal(0);
    }
  }, [q, categoryId, brand, sort, priceMin, priceMax, page, pageSize, isAdmin, includeInactive, categories]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when window regains focus or visibility
  useEffect(() => {
    function handleFocus() {
      fetchData();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  // Fetch taxonomy (categories + brands)
  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      try {
        const [catsRes, brs] = await Promise.all([
          api.listCategories().catch(() => ({ items: [] })),
          api.listBrands().catch(() => []),
        ]);
        if (cancelled) return;
        const cats = Array.isArray(catsRes) ? catsRes : (catsRes.items || []);
        setCategories(cats);
        setBrands(brs);
        if (onCategoriesLoaded) onCategoriesLoaded(cats);
      } catch {
        // non-blocking
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [onCategoriesLoaded]);

  // Browser popstate listener for back/forward navigation sync
  useEffect(() => {
    function onPopState() {
      const p = readUrlParams();
      if (!p) return;
      setQInput(p.q);
      setQ(p.q);
      setCategoryId(p.categoryId);
      setBrand(p.brand);
      setSort(p.sort);
      setPriceMinInput(p.priceMin);
      setPriceMin(p.priceMin);
      setPriceMaxInput(p.priceMax);
      setPriceMax(p.priceMax);
      setPage(p.page);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const onSubmitSearch = (e) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPage(1);
    setQ(qInput);
    if (qInput.trim()) {
      recordSearchIntent(qInput);
    }
  };

  const onClearSearch = () => {
    setQInput('');
    setQ('');
    lastRecordedSearchRef.current = '';
    setPage(1);
  };

  const onApplyPrice = () => {
    setPage(1);
    setPriceMin(priceMinInput);
    setPriceMax(priceMaxInput);
  };

  const onClearAll = () => {
    setQInput('');
    setQ('');
    setCategoryId('');
    setBrand('');
    setSort('');
    setPriceMinInput('');
    setPriceMaxInput('');
    setPriceMin('');
    setPriceMax('');
    setPage(1);
  };

  // Remove individual intent chips and update active search string
  const handleRemoveChip = (type, val) => {
    if (type === 'category') {
      const catName = serverIntent?.category?.name || '';
      const regex = new RegExp(`\\b${catName}\\b|điện thoại|laptop|tai nghe|chuột|bàn phím|máy tính`, 'gi');
      const nextQ = qInput.replace(regex, '').replace(/\s+/g, ' ').trim();
      setQInput(nextQ);
      setQ(nextQ);
      setCategoryId('');
      setPage(1);
    } else if (type === 'budget') {
      const budgetRegex = /(dưới|tối đa|từ|đến|tới|trên|khoảng|quanh|giá)\s+[\d.,]+\s*(triệu|tr|k|đ)?(\s*(đến|tới|-)\s*[\d.,]+\s*(triệu|tr|k|đ)?)?|[\d.,]+\s*(triệu|tr\d*|k|đ)\b/gi;
      const nextQ = qInput.replace(budgetRegex, '').replace(/\s+/g, ' ').trim();
      setQInput(nextQ);
      setQ(nextQ);
      setPriceMin('');
      setPriceMax('');
      setPriceMinInput('');
      setPriceMaxInput('');
      setPage(1);
    } else if (type === 'excludedBrand') {
      const regex = new RegExp(`(không|ko|trừ|chừa)\\s+${val}`, 'gi');
      const nextQ = qInput.replace(regex, '').replace(/\s+/g, ' ').trim();
      setQInput(nextQ);
      setQ(nextQ);
      setPage(1);
    } else if (type === 'brand') {
      const regex = new RegExp(`\\b${val}\\b`, 'gi');
      const nextQ = qInput.replace(regex, '').replace(/\s+/g, ' ').trim();
      setBrand('');
      setQInput(nextQ);
      setQ(nextQ);
      setPage(1);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedCategory = categories.find((c) => c.categoryId === effectiveCategoryId);

  // Dynamic Technical SEO
  useEffect(() => {
    const pageTitle = selectedCategory
      ? `Sản phẩm ${selectedCategory.name}`
      : (q ? `Kết quả cho "${q}"` : 'Cửa hàng');
    setDocumentTitle(pageTitle);

    const desc = selectedCategory
      ? (selectedCategory.description || `Khám phá các sản phẩm công nghệ ${selectedCategory.name} tại Gợi Ý.`)
      : (q
        ? `Kết quả tìm kiếm cho từ khóa "${q}" tại Gợi Ý.`
        : 'Khám phá các sản phẩm công nghệ với gợi ý mua sắm thông minh và cá nhân hóa.');
    setMetaDescription(desc);
    setCanonicalUrl();
  }, [selectedCategory, q]);

  // Construct active chips list
  const activeChips = [];
  if (serverIntent?.category) {
    activeChips.push({
      id: 'cat',
      label: serverIntent.category.name,
      onRemove: () => handleRemoveChip('category'),
    });
  } else if (categoryId && selectedCategory) {
    activeChips.push({
      id: 'cat',
      label: selectedCategory.name,
      onRemove: () => {
        setCategoryId('');
        setPage(1);
      },
    });
  }

  const budgetLabel = formatIntentBudgetChip(serverIntent);
  if (budgetLabel) {
    activeChips.push({
      id: 'budget',
      label: budgetLabel,
      onRemove: () => handleRemoveChip('budget'),
    });
  } else if (priceMin || priceMax) {
    const minTxt = priceMin ? `${Number(priceMin).toLocaleString('vi-VN')}₫` : '';
    const maxTxt = priceMax ? `${Number(priceMax).toLocaleString('vi-VN')}₫` : '';
    const lbl = minTxt && maxTxt ? `${minTxt} - ${maxTxt}` : (minTxt ? `Từ ${minTxt}` : `Dưới ${maxTxt}`);
    activeChips.push({
      id: 'budget_manual',
      label: lbl,
      onRemove: () => {
        setPriceMin('');
        setPriceMax('');
        setPriceMinInput('');
        setPriceMaxInput('');
        setPage(1);
      },
    });
  }

  if (serverIntent?.excludedBrands) {
    for (const eb of serverIntent.excludedBrands) {
      activeChips.push({
        id: `ex_${eb}`,
        label: `Không ${eb}`,
        onRemove: () => handleRemoveChip('excludedBrand', eb),
      });
    }
  }

  if (serverIntent?.brands) {
    for (const b of serverIntent.brands) {
      activeChips.push({
        id: `br_${b}`,
        label: b,
        onRemove: () => handleRemoveChip('brand', b),
      });
    }
  } else if (brand) {
    activeChips.push({
      id: 'brand_manual',
      label: brand,
      onRemove: () => {
        setBrand('');
        setPage(1);
      },
    });
  }

  const hasSearch = Boolean(q && q.trim());

  const filterControls = (
    <>
      <label className="filter-field">
        <span className="filter-label">Danh mục</span>
        <select
          value={effectiveCategoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span className="filter-label">Thương hiệu</span>
        <select
          value={effectiveBrand}
          onChange={(e) => {
            setBrand(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả thương hiệu</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span className="filter-label">Sắp xếp</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.key || 'rel'} value={o.key}>{o.label}</option>
          ))}
        </select>
      </label>

      <fieldset className="filter-field filter-field--price">
        <legend className="filter-label">Khoảng giá (VND)</legend>
        <div className="filter-price-presets">
          {PRICE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`chip${String(priceMin) === String(p.min) && String(priceMax) === String(p.max) ? ' chip--active' : ''}`}
              onClick={() => {
                const minStr = p.min === '' ? '' : String(p.min);
                const maxStr = p.max === '' ? '' : String(p.max);
                setPriceMinInput(minStr);
                setPriceMaxInput(maxStr);
                setPriceMin(minStr);
                setPriceMax(maxStr);
                setPage(1);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="filter-price-range">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Từ giá"
            value={priceMinInput}
            onChange={(e) => setPriceMinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApplyPrice()}
            aria-label="Giá tối thiểu"
          />
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Đến giá"
            value={priceMaxInput}
            onChange={(e) => setPriceMaxInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApplyPrice()}
            aria-label="Giá tối đa"
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', marginTop: '8px', minHeight: '38px', fontSize: '0.8125rem' }}
          onClick={onApplyPrice}
        >
          Áp dụng giá
        </button>
      </fieldset>

      {activeChips.length > 0 && (
        <div className="filter-reset-wrap">
          <button type="button" className="btn-ghost filter-reset-btn" onClick={onClearAll}>
            Xóa bộ lọc
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="store-page product-list-page">
      {/* Mobile Drawer (<= 1023px) */}
      {showFilters && (
        <div
          className="store-filter-backdrop"
          onClick={() => setShowFilters(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`store-filter-drawer${showFilters ? ' store-filter-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Bộ lọc sản phẩm"
      >
        <div className="store-filter-drawer__header">
          <h2>Bộ lọc</h2>
          <button
            type="button"
            className="btn-ghost small store-filter-drawer__close"
            onClick={() => setShowFilters(false)}
            aria-label="Đóng bộ lọc"
          >
            ✕
          </button>
        </div>
        <div className="store-filter-drawer__body">
          {filterControls}
        </div>
      </div>

      {/* 1. Header & Central Search Bar */}
      <div className="product-list__search-wrapper" ref={searchWrapRef}>
        <form className="product-list__search" onSubmit={onSubmitSearch} role="search" aria-label="Tìm kiếm sản phẩm">
          <div className="product-list__search-input">
            <svg
              className="product-list__search-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="pl-search"
              type="text"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Tìm theo tên sản phẩm, thương hiệu hoặc ngân sách…"
              autoComplete="off"
              aria-label="Từ khóa tìm kiếm sản phẩm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setShowSuggestions(false);
                  onSubmitSearch(e);
                } else if (e.key === 'Escape') {
                  setShowSuggestions(false);
                }
              }}
            />
            {qInput && (
              <button
                type="button"
                className="product-list__search-clear-btn"
                onClick={onClearSearch}
                aria-label="Xóa từ khóa"
                title="Xóa nhanh"
              >
                ✕
              </button>
            )}
          </div>
          <div className="product-list__search-actions">
            <button type="submit" className="btn-primary">Tìm kiếm</button>
          </div>
          <button
            type="button"
            className="btn-filter-toggle"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? 'Đóng bộ lọc' : 'Bộ lọc'}
          </button>
        </form>

        {/* Search Suggestions Dropdown */}
        {showSuggestions && recentSearches.length > 0 && (
          <div className="product-search-suggestions" role="listbox" aria-label="Lịch sử tìm kiếm">
            <div className="product-search-suggestions__section">
              <span className="product-search-suggestions__section-title">
                Tìm kiếm gần đây
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {recentSearches.slice(0, 6).map((s) => (
                  <button
                    key={s.eventId || s.query}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setQInput(s.query);
                      setQ(s.query);
                      setShowSuggestions(false);
                      recordSearchIntent(s.query);
                    }}
                  >
                    {s.query}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. STATE A: Non-search mode -> Greeting & "Dành cho bạn" at top */}
      {!hasSearch && (
        <>
          <header className="product-list__intro">
            <h1>{selectedCategory ? selectedCategory.name : 'Khám phá sản phẩm'}</h1>
            <p className="muted">
              {selectedCategory?.description || 'Chọn món công nghệ hợp với bạn.'}
            </p>
          </header>

          {!isAdmin && (
            <section className="product-list__recommendations-top" aria-label="Dành cho bạn">
              <Recommendations
                mode="hybrid"
                customerId={profile?.customerId}
                onSelectProduct={onSelectProduct}
                refreshKey={recoRefreshKey}
                title="Dành cho bạn"
                maxItems={4}
                showCrossCategory={false}
              />
            </section>
          )}
        </>
      )}

      {/* 3. Catalog layout: ONLY 2 DIRECT CHILDREN (Filters Aside + Results Section) */}
      <div className="store-catalog-layout product-list__layout">
        {/* Desktop Sidebar Filters */}
        <aside
          className="store-filter-panel product-list__filters"
          aria-label="Bộ lọc chi tiết"
        >
          <div className="product-list__filters-header">
            <h2>Bộ lọc</h2>
          </div>
          {filterControls}
        </aside>

        {/* Results Area */}
        <section className="store-results product-list__results" aria-label="Danh sách kết quả">
          {/* Header for search mode */}
          {hasSearch && (
            <div className="product-list__results-header">
              <h1 className="product-list__results-title">
                Kết quả cho “{q}”
                {total > 0 && <span className="product-count-badge">({total} sản phẩm)</span>}
              </h1>

              <div className="product-list__results-sort-inline">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sắp xếp kết quả"
                  className="product-list__sort-select"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.key || 'rel'} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Active Filter Chips */}
          {activeChips.length > 0 && (
            <div className="product-active-chips" role="region" aria-label="Bộ lọc đang áp dụng">
              {activeChips.map((chip) => (
                <span key={chip.id} className="chip chip--active">
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Xóa ${chip.label}`}
                    className="chip__remove-btn"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="btn-ghost small filter-clear-all-chip"
                onClick={onClearAll}
              >
                Xóa bộ lọc
              </button>
            </div>
          )}

          {/* Loading State */}
          {status.kind === 'loading' && (
            <div className="product-list__loading" role="status">
              <div className="spinner" aria-hidden="true" />
              <p className="muted">Đang tìm sản phẩm…</p>
            </div>
          )}

          {/* Error State */}
          {status.kind === 'error' && (
            <div className="error-text" role="alert">
              <p>Không tải được danh sách sản phẩm. Vui lòng thử lại.</p>
              <button type="button" className="btn-ghost" onClick={fetchData}>Tải lại</button>
            </div>
          )}

          {/* Empty State */}
          {status.kind !== 'loading' && status.kind === 'ready' && items.length === 0 && (
            <div className="product-list__empty">
              <span className="empty-icon" aria-hidden="true">📦</span>
              <p className="muted">{emptyMessage || 'Không tìm thấy sản phẩm nào phù hợp với bộ lọc hiện tại.'}</p>
              <button type="button" className="btn-primary" onClick={onClearAll}>Xóa bộ lọc</button>
            </div>
          )}

          {/* Main Product Grid */}
          {items.length > 0 && (
            <div className={`store-product-grid product-grid${items.length === 1 ? ' product-grid--single' : ''}`}>
              {items.map((p) => (
                <ProductCard
                  key={p.productId}
                  item={p}
                  onSelectProduct={onSelectProduct}
                  showMenu={false}
                />
              ))}
            </div>
          )}

          {/* Pagination: Hidden when only 1 page */}
          {items.length > 0 && totalPages > 1 && (
            <nav className="product-list__footer" aria-label="Phân trang sản phẩm">
              <span className="muted small">
                Trang {page} / {totalPages} (Tổng {total} sản phẩm)
              </span>
              <div className="pagination">
                <button
                  type="button"
                  className="pagination__btn"
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={page <= 1}
                  aria-label="Trang trước"
                >
                  ← Trước
                </button>
                <span className="pagination__current">{page}</span>
                <button
                  type="button"
                  className="pagination__btn"
                  onClick={() => {
                    setPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={page >= totalPages}
                  aria-label="Trang sau"
                >
                  Sau →
                </button>
              </div>
            </nav>
          )}

          {/* STATE B (Search Mode): "Lựa chọn tương tự" placed strictly AFTER search results */}
          {hasSearch && (
            <section className="search-similar-section" aria-label="Lựa chọn tương tự" style={{ marginTop: '32px' }}>
              <Recommendations
                mode="hybrid"
                customerId={profile?.customerId}
                onSelectProduct={onSelectProduct}
                refreshKey={recoRefreshKey}
                title="Lựa chọn tương tự"
                maxItems={4}
                showCrossCategory={false}
              />
            </section>
          )}
        </section>
      </div>

      {/* 4. Khối gợi ý bổ sung cuối trang (anh em của store-catalog-layout, dùng full width store-page) */}
      {!hasSearch && !isAdmin && (
        <section className="store-bottom-reco catalog-discovery-section" aria-label="Tiếp tục khám phá" style={{ marginTop: '32px' }}>
          <Recommendations
            mode="hybrid"
            customerId={profile?.customerId}
            onSelectProduct={onSelectProduct}
            refreshKey={recoRefreshKey}
            title="Tiếp tục khám phá"
            maxItems={4}
            showCrossCategory={false}
          />
        </section>
      )}
    </div>
  );
}
