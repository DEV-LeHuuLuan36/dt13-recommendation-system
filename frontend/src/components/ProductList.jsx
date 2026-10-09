import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, normalizeSearchText } from '../utils/format.js';
import Recommendations from './Recommendations.jsx';
import '../styles/ProductList.css';

const SORT_OPTIONS = [
  { key: '', label: 'Liên quan' },
  { key: 'price_asc', label: 'Giá tăng dần' },
  { key: 'price_desc', label: 'Giá giảm dần' },
  { key: 'name_asc', label: 'Tên A-Z' },
  { key: 'name_desc', label: 'Tên Z-A' },
  { key: 'newest', label: 'Mới nhất' },
];

const PRICE_PRESETS = [
  { key: 'all', label: 'Tất cả', min: '', max: '' },
  { key: 'u5', label: 'Dưới 5 triệu', min: 0, max: 5_000_000 },
  { key: '5to15', label: '5 - 15 triệu', min: 5_000_000, max: 15_000_000 },
  { key: '15to30', label: '15 - 30 triệu', min: 15_000_000, max: 30_000_000 },
  { key: 'o30', label: 'Trên 30 triệu', min: 30_000_000, max: '' },
];

function fallbackSvg(alt) {
  const text = (alt || 'Sản phẩm').slice(0, 18);
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="#167d69"/><text x="100" y="78" text-anchor="middle" fill="white" font-family="sans-serif" font-size="18">${text}</text></svg>`
  )}`;
}

function ProductImage({ src, alt }) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return <img className="product-card__image" src={fallbackSvg(alt)} alt={alt || 'Sản phẩm'} loading="lazy" decoding="async" width="400" height="300" />;
  }
  return <img className="product-card__image" src={src} alt={alt || 'Sản phẩm'} loading="lazy" decoding="async" width="400" height="300" onError={() => setErrored(true)} />;
}

function readUrlState() {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get('q') || '',
    categoryId: sp.get('categoryId') || '',
    brand: sp.get('brand') || '',
    sort: sp.get('sort') || '',
    priceMin: sp.get('priceMin') || '',
    priceMax: sp.get('priceMax') || '',
    page: Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1),
  };
}

function writeUrlState(state) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.categoryId) sp.set('categoryId', state.categoryId);
  if (state.brand) sp.set('brand', state.brand);
  if (state.sort) sp.set('sort', state.sort);
  if (state.priceMin) sp.set('priceMin', state.priceMin);
  if (state.priceMax) sp.set('priceMax', state.priceMax);
  if (state.page > 1) sp.set('page', String(state.page));
  const qs = sp.toString();
  const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  if (next !== window.location.pathname + window.location.search) {
    window.history.replaceState(null, '', next);
  }
}

export default function ProductList({ profile, onSelectProduct, recoRefreshKey = 0, onCategoriesLoaded }) {
  const isAdmin = profile && profile.role === 'admin';
  const isCustomer = profile && profile.role === 'customer';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const initial = useMemo(() => readUrlState() || { q: '', categoryId: '', brand: '', sort: '', priceMin: '', priceMax: '', page: 1 }, []);
  const [qInput, setQInput] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [brand, setBrand] = useState(initial.brand);
  const [sort, setSort] = useState(initial.sort);
  const [priceMin, setPriceMin] = useState(initial.priceMin);
  const [priceMax, setPriceMax] = useState(initial.priceMax);
  const [page, setPage] = useState(initial.page);
  const [pageSize] = useState(24);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const requestSeq = useRef(0);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    writeUrlState({ q, categoryId, brand, sort, priceMin, priceMax, page });
  }, [q, categoryId, brand, sort, priceMin, priceMax, page]);

  // Debounce: commit the search box value 350ms after typing stops.
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

  // Any non-page filter change resets to page 1.
  useEffect(() => { setPage(1); }, [categoryId, brand, sort, priceMin, priceMax]);

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
        q: normalizeSearchText(q),
        categoryId: categoryId || null,
        brand: brand || null,
        sort: sort || null,
        priceMin: priceMin === '' ? null : Number(priceMin),
        priceMax: priceMax === '' ? null : Number(priceMax),
        includeInactive: isAdmin && includeInactive,
        _signal: ctrl.signal,
      };
      const data = await api.listProducts(params);
      if (mySeq !== requestSeq.current) return;
      setItems(data.items);
      setTotal(data.total);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (mySeq !== requestSeq.current) return;
      if (err.name === 'AbortError') return;
      setStatus({ kind: 'error', error: err.message });
    }
  }, [page, pageSize, q, categoryId, brand, sort, priceMin, priceMax, isAdmin, includeInactive]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    api.listCategories()
      .then((d) => {
        const items = d.items || [];
        setCategories(items);
        if (onCategoriesLoaded) onCategoriesLoaded(items);
      })
      .catch(() => {});
  }, [onCategoriesLoaded]);

  // Derive the brand filter from the current result set.
  useEffect(() => {
    if (items.length === 0) { setBrands([]); return; }
    const set = new Set();
    for (const p of items) if (p.brand) set.add(p.brand);
    const next = Array.from(set).sort();
    setBrands(next);
  }, [items]);

  // React to category chips in the header.
  useEffect(() => {
    function onJump(e) {
      const cid = e?.detail?.categoryId;
      if (cid) {
        setCategoryId(cid);
        setPage(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    window.addEventListener('dt13:jump-category', onJump);
    return () => window.removeEventListener('dt13:jump-category', onJump);
  }, []);

  const onSubmitSearch = (e) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPage(1);
    setQ(qInput);
  };
  const onClearSearch = () => {
    setQInput('');
    setPage(1);
    setQ('');
  };
  const onClearAll = () => {
    setQInput(''); setQ(''); setCategoryId(''); setBrand(''); setSort('');
    setPriceMin(''); setPriceMax(''); setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  const activeFilters = (q ? 1 : 0) + (categoryId ? 1 : 0) + (brand ? 1 : 0) + (priceMin || priceMax ? 1 : 0) + (sort ? 1 : 0);

  const selectedCategory = categories.find((c) => c.categoryId === categoryId);

  return (
    <section className="product-list" aria-label="Danh sách sản phẩm">
      {isCustomer && (
        <div className="product-list__hero">
          <Recommendations
            mode="me"
            onSelectProduct={onSelectProduct}
            refreshKey={recoRefreshKey}
            maxItems={4}
          />
        </div>
      )}

      <header className="product-list__intro">
        <h1>{selectedCategory ? selectedCategory.name : 'Khám phá sản phẩm'}</h1>
        <p className="muted">
          {selectedCategory
            ? (selectedCategory.description || `Các sản phẩm thuộc danh mục ${selectedCategory.name}.`)
            : 'Sản phẩm công nghệ theo nhu cầu của bạn. Tìm kiếm theo tên, model hoặc hãng.'}
        </p>
      </header>

      <form className="product-list__search" onSubmit={onSubmitSearch} role="search" aria-label="Tìm kiếm sản phẩm">
        <label className="visually-hidden" htmlFor="pl-search">Từ khóa tìm kiếm</label>
        <div className="product-list__search-input">
          <span className="product-list__search-icon" aria-hidden="true">⌕</span>
          <input
            id="pl-search"
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm theo tên, model hoặc thương hiệu…"
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmitSearch(e); } }}
          />
        </div>
        <div className="product-list__search-actions">
          <button type="submit" className="btn-primary">Tìm kiếm</button>
          {q && (
            <button type="button" className="btn-ghost" onClick={onClearSearch}>Xóa từ khóa</button>
          )}
        </div>
        <button
          type="button"
          className="btn-filter-toggle"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? 'Ẩn bộ lọc' : `Bộ lọc${activeFilters ? ` (${activeFilters})` : ''}`}
        </button>
      </form>

      <div className="product-list__layout">
        <aside className={`product-list__filters${showFilters ? ' product-list__filters--open' : ''}`} aria-label="Bộ lọc chi tiết">
          <h2 className="product-list__filters-title">Bộ lọc</h2>
          <label className="filter-field">
            <span>Danh mục</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Tất cả</option>
              {categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Thương hiệu</span>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Tất cả</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Sắp xếp</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.key || 'rel'} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
          <fieldset className="filter-field filter-field--price">
            <legend>Giá (VND)</legend>
            <div className="filter-price-presets">
              {PRICE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`chip${String(priceMin) === String(p.min) && String(priceMax) === String(p.max) ? ' chip--active' : ''}`}
                  onClick={() => { setPriceMin(p.min === '' ? '' : String(p.min)); setPriceMax(p.max === '' ? '' : String(p.max)); }}
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
                placeholder="Từ"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                aria-label="Giá tối thiểu"
              />
              <span aria-hidden="true">-</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Đến"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                aria-label="Giá tối đa"
              />
            </div>
          </fieldset>
          {isAdmin && (
            <label className="filter-field filter-field--inline">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              <span>Hiện sản phẩm ngừng kinh doanh</span>
            </label>
          )}
          <div className="filter-actions">
            <button type="button" className="btn-ghost" onClick={onClearAll}>Đặt lại</button>
          </div>
        </aside>

        <div className="product-list__results">
          {status.kind === 'loading' && <p className="muted" role="status">Đang tải…</p>}
          {status.kind === 'error' && (
            <div className="error-text" role="alert">
              Không tải được danh sách. Vui lòng thử lại.
              <div><button type="button" className="btn-ghost" onClick={fetchData}>Thử lại</button></div>
            </div>
          )}

          {status.kind !== 'loading' && status.kind === 'ready' && items.length === 0 && (
            <div className="product-list__empty">
              <p className="muted">Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại.</p>
              <button type="button" className="btn-ghost" onClick={onClearAll}>Xóa bộ lọc</button>
            </div>
          )}

          {items.length > 0 && (
            <ul className="product-grid">
              {items.map((p) => (
                <li key={p.productId} className={`product-card${p.active === false ? ' product-card--inactive' : ''}`}>
                  <button
                    type="button"
                    className="product-card__open"
                    onClick={() => onSelectProduct(p.productId)}
                    aria-label={`Xem chi tiết ${p.name}`}
                  >
                    <div className="product-card__image-wrap">
                      <ProductImage src={p.imageUrl} alt={p.name} />
                    </div>
                    <div className="product-card__body">
                      {p.brand && <p className="product-card__brand">{p.brand}</p>}
                      <h3 className="product-card__name">{p.name}</h3>
                      <p className="product-card__price">{formatVnd(p.price)} đ</p>
                      <span className="product-card__cta">Xem chi tiết</span>
                      {p.active === false && <span className="badge badge--warn product-card__badge">Ngừng KD</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <footer className="product-list__footer">
              <span className="muted">
                {total === 0 ? '0' : `${startItem}-${endItem}`} / {total} sản phẩm
              </span>
              <div className="pagination">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Trước
                </button>
                <span>Trang {page} / {totalPages}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Sau
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </section>
  );
}
