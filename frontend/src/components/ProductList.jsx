import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, normalizeSearchText } from '../utils/format.js';
import { getProductPlaceholderSvg, getProductImageUrl } from '../utils/imageFallback.js';
import { setCanonicalUrl, setDocumentTitle, setMetaDescription, setProductListStructuredData } from '../utils/seo.js';
import Recommendations from './Recommendations.jsx';
import '../styles/ProductList.css';

const SORT_OPTIONS = [
  { key: '', label: 'Liên quan nhất' },
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

function ProductCardImage({ src, alt, category, productId }) {
  const [errored, setErrored] = useState(false);
  const resolvedUrl = useMemo(() => getProductImageUrl(productId, src), [productId, src]);
  const fallback = useMemo(() => getProductPlaceholderSvg(category || alt, 400, 300), [category, alt]);

  if (errored || !resolvedUrl) {
    return (
      <img
        className="product-card__image"
        src={fallback}
        alt={alt || 'Sản phẩm'}
        loading="lazy"
        decoding="async"
        width="400"
        height="300"
      />
    );
  }

  return (
    <img
      className="product-card__image"
      src={resolvedUrl}
      alt={alt || 'Sản phẩm'}
      loading="lazy"
      decoding="async"
      width="400"
      height="300"
      onError={() => setErrored(true)}
    />
  );
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
  const isCustomer = profile && profile.role === 'customer';

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
  const [pageSize] = useState(24);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState({ kind: 'loading', error: null });

  // Autocomplete Suggestions State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestProducts, setSuggestProducts] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const searchWrapRef = useRef(null);
  const suggestDebounceRef = useRef(null);

  const requestSeq = useRef(0);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  // Fetch dynamic suggestions when user types in qInput
  useEffect(() => {
    const term = qInput.trim();
    if (!term) {
      setSuggestProducts([]);
      setSuggestLoading(false);
      return;
    }
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    suggestDebounceRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await api.listProducts({ q: term, pageSize: 5 });
        setSuggestProducts(res.items || []);
      } catch {
        setSuggestProducts([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 200);
    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [qInput]);

  // Click outside listener to dismiss autocomplete dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Gợi ý Danh mục và Từ khóa phù hợp (Shopee/Tiki style)
  const categorySuggestions = useMemo(() => {
    const raw = qInput.trim();
    const term = normalizeSearchText(raw);
    if (!term) return [];

    const results = [];
    const seenIds = new Set();

    // 1.1 Khớp trực tiếp tên danh mục (ví dụ "lap" khớp "Laptop")
    for (const cat of categories) {
      const catNorm = normalizeSearchText(cat.name);
      if (catNorm.includes(term) || term.includes(catNorm)) {
        if (!seenIds.has(cat.categoryId)) {
          seenIds.add(cat.categoryId);
          results.push({
            type: 'category',
            category: cat,
            label: cat.name,
            subtext: `Xem toàn bộ ${cat.name}`,
          });
        }
      }
    }

    // 1.2 Nhận diện từ khóa công nghệ phổ biến để gợi ý danh mục liên quan
    if (term.includes('lap') || term.includes('notebook') || term.includes('macbook')) {
      const lapCat = categories.find((c) => normalizeSearchText(c.name).includes('laptop'));
      if (lapCat && !seenIds.has(lapCat.categoryId)) {
        seenIds.add(lapCat.categoryId);
        results.push({ type: 'category', category: lapCat, label: 'Laptop', subtext: 'Máy tính xách tay' });
      }
      const bpCat = categories.find((c) => normalizeSearchText(c.name).includes('phim'));
      if (bpCat && !seenIds.has('extra_keyboard')) {
        seenIds.add('extra_keyboard');
        results.push({ type: 'keyword', category: bpCat, label: 'Bàn phím cho Laptop', subtext: 'Phụ kiện bàn phím' });
      }
      const chCat = categories.find((c) => normalizeSearchText(c.name).includes('chuot'));
      if (chCat && !seenIds.has('extra_mouse')) {
        seenIds.add('extra_mouse');
        results.push({ type: 'keyword', category: chCat, label: 'Chuột máy tính Laptop', subtext: 'Phụ kiện chuột' });
      }
    } else if (term.includes('phone') || term.includes('dien thoai') || term.includes('iphone')) {
      const dtCat = categories.find((c) => normalizeSearchText(c.name).includes('dien thoai'));
      if (dtCat && !seenIds.has(dtCat.categoryId)) {
        seenIds.add(dtCat.categoryId);
        results.push({ type: 'category', category: dtCat, label: dtCat.name, subtext: 'Điện thoại thông minh' });
      }
      const tnCat = categories.find((c) => normalizeSearchText(c.name).includes('tai'));
      if (tnCat && !seenIds.has('extra_earphone')) {
        seenIds.add('extra_earphone');
        results.push({ type: 'keyword', category: tnCat, label: 'Tai nghe cho Điện thoại', subtext: 'Phụ kiện âm thanh' });
      }
    } else if (term.includes('tai') || term.includes('nghe') || term.includes('headphone') || term.includes('audio')) {
      const tnCat = categories.find((c) => normalizeSearchText(c.name).includes('tai'));
      if (tnCat && !seenIds.has(tnCat.categoryId)) {
        seenIds.add(tnCat.categoryId);
        results.push({ type: 'category', category: tnCat, label: tnCat.name, subtext: 'Thiết bị âm thanh' });
      }
    } else if (term.includes('phim') || term.includes('ban phim') || term.includes('keyboard')) {
      const bpCat = categories.find((c) => normalizeSearchText(c.name).includes('phim'));
      if (bpCat && !seenIds.has(bpCat.categoryId)) {
        seenIds.add(bpCat.categoryId);
        results.push({ type: 'category', category: bpCat, label: bpCat.name, subtext: 'Bàn phím cơ & văn phòng' });
      }
    } else if (term.includes('chuot') || term.includes('mouse')) {
      const cCat = categories.find((c) => normalizeSearchText(c.name).includes('chuot'));
      if (cCat && !seenIds.has(cCat.categoryId)) {
        seenIds.add(cCat.categoryId);
        results.push({ type: 'category', category: cCat, label: cCat.name, subtext: 'Chuột không dây & gaming' });
      }
    }

    return results.slice(0, 3);
  }, [categories, qInput]);

  // 2. Gợi ý Thương hiệu (Brands)
  const brandSuggestions = useMemo(() => {
    const raw = qInput.trim();
    const term = normalizeSearchText(raw);
    if (!term) return [];

    const allBrands = Array.from(new Set([
      ...POPULAR_BRANDS,
      ...(brands || []),
      ...items.map((p) => p.brand).filter(Boolean),
    ]));

    return allBrands
      .filter((b) => normalizeSearchText(b).includes(term))
      .sort((a, b) => {
        const aNorm = normalizeSearchText(a);
        const bNorm = normalizeSearchText(b);
        const aStarts = aNorm.startsWith(term);
        const bStarts = bNorm.startsWith(term);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 5);
  }, [brands, items, qInput]);

  // 3. Tối đa 3-4 dòng sản phẩm gợi ý thu gọn dạng text đơn giản (KHÔNG ẢNH TO)
  const compactProducts = useMemo(() => {
    return suggestProducts.slice(0, 4);
  }, [suggestProducts]);

  const hasSuggestions = Boolean(
    qInput.trim() &&
    (categorySuggestions.length > 0 || brandSuggestions.length > 0 || compactProducts.length > 0 || suggestLoading)
  );

  const handleSelectCategoryOrKeyword = (item) => {
    if (item.category) {
      setCategoryId(item.category.categoryId);
    }
    if (item.type === 'keyword') {
      setQInput(item.label);
      setQ(item.label);
    } else {
      setQInput('');
      setQ('');
    }
    setBrand('');
    setShowSuggestions(false);
    setPage(1);
  };

  const handleSelectBrandSuggestion = (b) => {
    setBrand(b);
    setQInput(b);
    setQ(b);
    setCategoryId('');
    setShowSuggestions(false);
    setPage(1);
  };

  const handleSelectProductSuggestion = (p) => {
    setShowSuggestions(false);
    if (onSelectProduct) {
      onSelectProduct(p.productId);
    } else {
      setQInput(p.name);
      setQ(p.name);
      setPage(1);
    }
  };

  // Sync categoryId if prop changes
  useEffect(() => {
    if (initialCategoryId !== null && initialCategoryId !== categoryId) {
      setCategoryId(initialCategoryId);
      setPage(1);
    }
  }, [initialCategoryId, categoryId]);

  // Listen to external category jump events from strip
  useEffect(() => {
    function onJump(e) {
      const cId = e.detail?.categoryId || '';
      setCategoryId(cId);
      setPage(1);
    }
    window.addEventListener('dt13:jump-category', onJump);
    return () => window.removeEventListener('dt13:jump-category', onJump);
  }, []);

  // Update URL parameters
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
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [qInput, q]);

  // Reset page when filters change
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

      setItems(data.items);
      setTotal(data.total);
      setStatus({ kind: 'ready', error: null });

      // SEO JSON-LD structured data injection
      const selectedCat = categories.find((c) => c.categoryId === categoryId);
      setProductListStructuredData(data.items, selectedCat?.name);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (mySeq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message });
    }
  }, [page, pageSize, q, categoryId, brand, sort, priceMin, priceMax, includeInactive, isAdmin, categories]);

  useEffect(() => {
    fetchData();
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
  };

  const onClearSearch = () => {
    setQInput('');
    setQ('');
    setPage(1);
  };

  const onApplyPrice = () => {
    setPage(1);
    setPriceMin(priceMinInput);
    setPriceMax(priceMaxInput);
  };

  const onClearPrice = () => {
    setPriceMinInput('');
    setPriceMaxInput('');
    setPriceMin('');
    setPriceMax('');
    setPage(1);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  const activeFiltersCount = (q ? 1 : 0) + (categoryId ? 1 : 0) + (brand ? 1 : 0) + (priceMin || priceMax ? 1 : 0) + (sort ? 1 : 0);

  const selectedCategory = categories.find((c) => c.categoryId === categoryId);

  // Dynamic Technical SEO: title & meta description update according to current search/category
  useEffect(() => {
    const pageTitle = selectedCategory
      ? `Sản phẩm ${selectedCategory.name}`
      : (q ? `Tìm kiếm: "${q}"` : 'Cửa hàng Sản phẩm Công nghệ');
    setDocumentTitle(pageTitle);

    const desc = selectedCategory
      ? (selectedCategory.description || `Khám phá các sản phẩm công nghệ cao cấp thuộc danh mục ${selectedCategory.name} tại DT13 Store.`)
      : (q
        ? `Kết quả tìm kiếm sản phẩm với từ khóa "${q}" tại DT13 Store.`
        : 'Khám phá các sản phẩm công nghệ với thuật toán gợi ý lọc cộng tác (Collaborative Filtering) trên Neo4j Graph Database.');
    setMetaDescription(desc);
    setCanonicalUrl();
  }, [selectedCategory, q]);

  return (
    <div className="product-list-page">
      {/* 1. KHỐI HERO & TIÊU ĐỀ H1 DUY NHẤT CỦA TRANG */}
      <header className="product-list__intro">
        <div className="product-list__intro-text">
          <h1>{selectedCategory ? selectedCategory.name : 'Khám phá sản phẩm công nghệ'}</h1>
          <p className="muted">
            {selectedCategory
              ? (selectedCategory.description || `Các sản phẩm công nghệ cao cấp thuộc danh mục ${selectedCategory.name}.`)
              : 'Trải nghiệm mua sắm hiện đại với thuật toán gợi ý cá nhân hóa dựa trên cơ sở dữ liệu đồ thị Neo4j.'}
          </p>
        </div>
      </header>

      {/* 2. THANH TÌM KIẾM TRUNG TÂM VỚI AUTOCOMPLETE SUGGESTIONS */}
      <div className="product-list__search-wrapper" ref={searchWrapRef}>
        <form className="product-list__search" onSubmit={onSubmitSearch} role="search" aria-label="Tìm kiếm sản phẩm">
          <div className="product-list__search-input">
            <span className="product-list__search-icon" aria-hidden="true">🔍</span>
            <input
              id="pl-search"
              type="text"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                if (qInput.trim()) setShowSuggestions(true);
              }}
              placeholder="Tìm theo tên sản phẩm, mã SKU hoặc thương hiệu…"
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
            {/* Dấu × nhỏ gọn tích hợp ngay bên trong ô input để xóa nhanh text */}
            {qInput && (
              <button
                type="button"
                className="product-list__search-clear-btn"
                onClick={onClearSearch}
                aria-label="Xóa nhanh từ khóa"
                title="Xóa nhanh"
              >
                ×
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
            {showFilters ? 'Ẩn bộ lọc' : `Bộ lọc${activeFiltersCount ? ` (${activeFiltersCount})` : ''}`}
          </button>
        </form>

        {/* Dropdown Gợi ý tìm kiếm thông minh (Autocomplete Suggestions - Chuẩn Shopee/Tiki/Amazon) */}
        {showSuggestions && hasSuggestions && (
          <div className="product-search-suggestions" role="listbox" aria-label="Gợi ý tìm kiếm">
            {/* PHẦN 1: Gợi ý Từ khóa / Danh mục phù hợp */}
            {categorySuggestions.length > 0 && (
              <div className="product-search-suggestions__section">
                <span className="product-search-suggestions__section-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Danh mục phù hợp
                </span>
                <div className="product-search-suggestions__categories">
                  {categorySuggestions.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="product-search-suggestions__cat-row"
                      onClick={() => handleSelectCategoryOrKeyword(item)}
                    >
                      <span className="product-search-suggestions__cat-icon" aria-hidden="true">🏷️</span>
                      <span className="product-search-suggestions__cat-text">
                        Tìm <strong>{item.label}</strong> trong {item.subtext}
                      </span>
                      <span className="product-search-suggestions__cat-badge">Danh mục</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PHẦN 2: Gợi ý Thương hiệu (Brands) */}
            {brandSuggestions.length > 0 && (
              <div className="product-search-suggestions__section">
                <span className="product-search-suggestions__section-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Thương hiệu khớp từ khóa
                </span>
                <div className="product-search-suggestions__brands">
                  {brandSuggestions.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className="product-search-suggestions__brand-chip"
                      onClick={() => handleSelectBrandSuggestion(b)}
                      title={`Lọc theo thương hiệu ${b}`}
                    >
                      <span className="brand-chip__icon" aria-hidden="true">⚡</span>
                      <strong>{b}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PHẦN 3: Gợi ý Sản phẩm thu gọn (Tối đa 3-4 dòng text đơn giản, KHÔNG ẢNH TO) */}
            {(suggestLoading || compactProducts.length > 0) && (
              <div className="product-search-suggestions__section">
                <span className="product-search-suggestions__section-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  Sản phẩm gợi ý
                </span>
                {suggestLoading ? (
                  <div className="product-search-suggestions__loading">
                    <div className="spinner small" aria-hidden="true" />
                    <span className="muted small">Đang tìm kiếm gợi ý…</span>
                  </div>
                ) : (
                  <div className="product-search-suggestions__mini-products">
                    {compactProducts.map((p) => (
                      <div
                        key={p.productId}
                        role="option"
                        aria-selected="false"
                        className="product-search-suggestions__mini-row"
                        onClick={() => handleSelectProductSuggestion(p)}
                      >
                        <span className="product-search-suggestions__mini-bullet" aria-hidden="true">📦</span>
                        <div className="product-search-suggestions__mini-main">
                          <span className="product-search-suggestions__mini-name" title={p.name}>
                            {p.name}
                          </span>
                          {p.brand && (
                            <span className="product-search-suggestions__mini-brand">
                              {p.brand}
                            </span>
                          )}
                        </div>
                        <span className="product-search-suggestions__mini-price">
                          {formatVnd(p.price)} ₫
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. KHỐI GỢI Ý THÔNG MINH DÀNH CHO BẠN (H2) - Nằm ngay dưới Hero & Search bar */}
      {isCustomer && (
        <section className="product-list__hero" aria-label="Gợi ý dành cho bạn">
          <Recommendations
            mode="me"
            onSelectProduct={onSelectProduct}
            refreshKey={recoRefreshKey}
            maxItems={4}
          />
        </section>
      )}

      {/* 4. KHỐI BỘ LỌC VÀ DANH SÁCH SẢN PHẨM TOÀN DIỆN */}
      <div className="product-list__layout">
        {/* Sidebar Bộ lọc bên trái */}
        <aside
          className={`product-list__filters${showFilters ? ' product-list__filters--open' : ''}`}
          aria-label="Bộ lọc chi tiết"
        >
          <div className="product-list__filters-header">
            <h2>Bộ lọc tìm kiếm</h2>
            {activeFiltersCount > 0 && (
              <button type="button" className="btn-ghost small" onClick={onClearAll}>
                Xóa tất cả ({activeFiltersCount})
              </button>
            )}
          </div>

          <label className="filter-field">
            <span className="filter-label">Danh mục</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">Thương hiệu</span>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Tất cả thương hiệu</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">Sắp xếp theo</span>
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
            <div className="filter-price-actions" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1, padding: '7px 12px', fontSize: '0.8125rem', minHeight: '34px' }}
                onClick={onApplyPrice}
              >
                Áp dụng lọc
              </button>
              {(priceMin !== '' || priceMax !== '' || priceMinInput !== '' || priceMaxInput !== '') && (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ flex: 1, padding: '7px 12px', fontSize: '0.8125rem', minHeight: '34px' }}
                  onClick={onClearPrice}
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </fieldset>

          {isAdmin && (
            <label className="filter-field filter-field--inline">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              <span>Hiện cả sản phẩm ngừng kinh doanh</span>
            </label>
          )}

          <div className="filter-reset-wrap">
            <button type="button" className="btn-ghost filter-reset-btn" onClick={onClearAll}>
              ↺ Đặt lại bộ lọc
            </button>
          </div>
        </aside>

        {/* Lưới sản phẩm bên phải */}
        <section className="product-list__results" aria-label="Danh sách sản phẩm">
          <div className="product-list__results-header">
            <h2 className="product-list__results-title">
              {selectedCategory ? `Sản phẩm ${selectedCategory.name}` : 'Tất cả sản phẩm'}
              {total > 0 && <span className="product-count-badge">({total})</span>}
            </h2>
            {total > 0 && (
              <span className="product-list__counter muted small">
                Hiển thị {startItem} - {endItem} trên tổng số {total}
              </span>
            )}
          </div>

          {status.kind === 'loading' && (
            <div className="product-list__loading" role="status">
              <div className="spinner" aria-hidden="true" />
              <p className="muted">Đang tải danh sách sản phẩm…</p>
            </div>
          )}

          {status.kind === 'error' && (
            <div className="error-text" role="alert">
              <p>Không tải được danh sách sản phẩm. Vui lòng thử lại.</p>
              <button type="button" className="btn-ghost" onClick={fetchData}>Tải lại</button>
            </div>
          )}

          {status.kind !== 'loading' && status.kind === 'ready' && items.length === 0 && (
            <div className="product-list__empty">
              <span className="empty-icon" aria-hidden="true">📦</span>
              <p className="muted">Không tìm thấy sản phẩm nào phù hợp với bộ lọc hiện tại.</p>
              <button type="button" className="btn-ghost" onClick={onClearAll}>Đặt lại bộ lọc</button>
            </div>
          )}

          {items.length > 0 && (
            <div className="product-grid">
              {items.map((p) => (
                <article
                  key={p.productId}
                  className={`product-card${p.active === false ? ' product-card--inactive' : ''}`}
                >
                  <div className="product-card__image-wrap">
                    <ProductCardImage
                      src={p.imageUrl}
                      alt={p.name}
                      category={p.categoryId || p.name}
                      productId={p.productId}
                    />
                    <span className="product-card__sku-badge">{p.productId}</span>
                    {p.brand && <span className="product-card__brand-tag">{p.brand}</span>}
                    {p.active === false && <span className="badge badge--warn product-card__badge-status">Ngừng KD</span>}
                  </div>

                  <div className="product-card__body">
                    <h3 className="product-card__name" title={p.name}>
                      {p.name}
                    </h3>
                    <div className="product-card__price">
                      {formatVnd(p.price)} <span className="currency">₫</span>
                    </div>

                    <div className="product-card__actions">
                      <button
                        type="button"
                        className="btn-primary product-card__btn"
                        onClick={() => onSelectProduct(p.productId)}
                        aria-label={`Xem chi tiết sản phẩm ${p.name}`}
                      >
                        Xem chi tiết
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {items.length > 0 && (
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
                    window.scrollTo({ top: 300, behavior: 'smooth' });
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
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                  }}
                  disabled={page >= totalPages}
                  aria-label="Trang sau"
                >
                  Sau →
                </button>
              </div>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
