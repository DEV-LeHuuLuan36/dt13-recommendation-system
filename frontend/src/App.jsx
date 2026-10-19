import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMe } from './api/auth.js';
import LoginForm from './components/LoginForm.jsx';
import ProductList from './components/ProductList.jsx';
import ProductDetail from './components/ProductDetail.jsx';
import MyHistory from './components/MyHistory.jsx';
import AdminConsole from './components/admin/AdminConsole.jsx';
import { formatUserDisplayName } from './utils/format.js';
import { setCanonicalUrl, setDocumentTitle, setMetaDescription, setMetaRobots } from './utils/seo.js';
import './styles/App.css';

/**
 * Parses route information from URL search parameters
 */
function parseUrlRoute() {
  if (typeof window === 'undefined') return { view: 'products', productId: null, categoryId: null };
  const sp = new URLSearchParams(window.location.search);
  const rawView = sp.get('view') || '';
  const productId = sp.get('id') || null;
  const categoryId = sp.get('category') || sp.get('categoryId') || null;

  let view = 'products';
  if (rawView === 'product' || rawView === 'productDetail' || productId) {
    view = 'productDetail';
  } else if (rawView === 'history') {
    view = 'history';
  } else if (rawView === 'admin') {
    view = 'admin';
  } else if (rawView === 'login') {
    view = 'login';
  } else {
    view = 'products';
  }

  return { view, productId, categoryId };
}

/**
 * Pushes updated route into browser history without reloading
 */
function pushUrlRoute(view, productId = null, categoryId = null, replace = false) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);

  if (view === 'products') {
    sp.set('view', 'products');
    sp.delete('id');
    if (categoryId) sp.set('category', categoryId);
  } else if (view === 'productDetail' && productId) {
    sp.set('view', 'product');
    sp.set('id', productId);
  } else if (view === 'history') {
    sp.set('view', 'history');
    sp.delete('id');
  } else if (view === 'admin') {
    sp.set('view', 'admin');
    sp.delete('id');
  } else if (view === 'login') {
    sp.set('view', 'login');
    sp.delete('id');
  }

  const newUrl = `${window.location.pathname}?${sp.toString()}`;
  if (newUrl !== window.location.pathname + window.location.search) {
    if (replace) {
      window.history.replaceState({ view, productId, categoryId }, '', newUrl);
    } else {
      window.history.pushState({ view, productId, categoryId }, '', newUrl);
    }
  }
}

/**
 * Dynamic View-level SEO configuration
 */
function applyViewSeo(view) {
  if (view === 'login') {
    setDocumentTitle('Đăng nhập');
    setMetaDescription('Đăng nhập vào Gợi Ý để trải nghiệm mua sắm thông minh được cá nhân hoá.');
    setMetaRobots('noindex, nofollow');
    setCanonicalUrl(null);
    return;
  }
  if (view === 'history') {
    setDocumentTitle('Lịch sử mua sắm và tương tác');
    setMetaDescription('Theo dõi nhật ký các sản phẩm đã xem và đã mua của bạn tại Gợi Ý.');
    setMetaRobots('noindex, nofollow');
    setCanonicalUrl(null);
    return;
  }
  if (view === 'admin') {
    setDocumentTitle('Bảng điều khiển Quản trị & Phân tích Đồ thị');
    setMetaDescription('Trang quản trị sản phẩm, danh mục, khách hàng và trực quan hóa thuật toán đồ thị gợi ý.');
    setMetaRobots('noindex, nofollow');
    setCanonicalUrl(null);
    return;
  }
  if (view === 'account') {
    setDocumentTitle('Tài khoản');
    setMetaDescription('Quản lý thông tin tài khoản người dùng.');
    setMetaRobots('noindex, nofollow');
    setCanonicalUrl(null);
    return;
  }
  if (view === 'products') {
    setDocumentTitle('Cửa hàng');
    setMetaDescription('Khám phá các sản phẩm công nghệ với hệ thống gợi ý mua sắm thông minh và cá nhân hóa.');
    setMetaRobots('index, follow');
    setCanonicalUrl();
  }
}

export default function App() {
  const [view, setView] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [recoRefreshKey, setRecoRefreshKey] = useState(0);
  const [categories, setCategories] = useState([]);
  const [returnTarget, setReturnTarget] = useState(null);

  // Session verification on initial load
  const restoreSession = useCallback(async () => {
    const route = parseUrlRoute();
    if (route.productId) setSelectedProductId(route.productId);
    if (route.categoryId) setActiveCategoryId(route.categoryId);

    try {
      const me = await fetchMe();
      if (me) {
        setProfile(me);
        if (route.view === 'admin' && me.role !== 'admin') {
          setView('products');
          pushUrlRoute('products', null, route.categoryId, true);
        } else if (route.view === 'history' && me.role !== 'customer') {
          setView('admin');
          pushUrlRoute('admin', null, null, true);
        } else {
          setView(route.view === 'login' ? (me.role === 'admin' ? 'admin' : 'products') : route.view);
        }
      } else {
        // Guest mode (401 from fetchMe)
        setProfile(null);
        if (route.view === 'history' || route.view === 'admin') {
          setView('login');
          pushUrlRoute('login', null, null, true);
        } else if (route.view === 'productDetail' && route.productId) {
          setView('productDetail');
        } else if (route.view === 'login') {
          setView('login');
        } else {
          setView('products');
          if (route.view !== 'products') {
            pushUrlRoute('products', null, route.categoryId, true);
          }
        }
      }
    } catch {
      setProfile(null);
      if (route.view === 'productDetail' && route.productId) {
        setView('productDetail');
      } else if (route.view === 'login') {
        setView('login');
      } else {
        setView('products');
      }
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Handle browser Back/Forward (popstate)
  useEffect(() => {
    function handlePopState() {
      const route = parseUrlRoute();
      if (route.productId) setSelectedProductId(route.productId);
      if (route.categoryId) setActiveCategoryId(route.categoryId);
      setView(route.view);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen for refresh recommendations event
  useEffect(() => {
    function onReco() { setRecoRefreshKey((k) => k + 1); }
    window.addEventListener('dt13:reco-refresh', onReco);
    return () => window.removeEventListener('dt13:reco-refresh', onReco);
  }, []);

  // Apply SEO metadata on view transition
  useEffect(() => {
    if (view !== 'loading' && view !== 'productDetail') {
      applyViewSeo(view);
    }
  }, [view]);

  const handleRequireLogin = useCallback((targetView = 'products', targetProductId = null) => {
    setReturnTarget({ view: targetView, productId: targetProductId });
    setView('login');
    pushUrlRoute('login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Navigation handlers
  const onLoggedIn = useCallback((p) => {
    setProfile(p);
    if (returnTarget) {
      const target = returnTarget;
      setReturnTarget(null);
      if (target.view === 'productDetail' && target.productId) {
        setSelectedProductId(target.productId);
        setView('productDetail');
        pushUrlRoute('productDetail', target.productId);
        return;
      }
      if (target.view === 'history') {
        setView('history');
        pushUrlRoute('history');
        return;
      }
    }
    const nextView = p.role === 'admin' ? 'admin' : 'products';
    setView(nextView);
    pushUrlRoute(nextView);
  }, [returnTarget]);

  const onLogout = useCallback(async () => {
    setAccountMenuOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* ignore */
    }
    setProfile(null);
    setView('products');
    pushUrlRoute('products');
  }, []);

  const onSelectProduct = useCallback((productId) => {
    setSelectedProductId(productId);
    setView('productDetail');
    setAccountMenuOpen(false);
    pushUrlRoute('productDetail', productId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goProducts = useCallback((catId = null) => {
    setView('products');
    if (catId) setActiveCategoryId(catId);
    setAccountMenuOpen(false);
    pushUrlRoute('products', null, catId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goHistory = useCallback(() => {
    if (!profile) {
      handleRequireLogin('history');
      return;
    }
    setView('history');
    setAccountMenuOpen(false);
    pushUrlRoute('history');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [profile, handleRequireLogin]);

  const goAdmin = useCallback(() => {
    setView('admin');
    setAccountMenuOpen(false);
    pushUrlRoute('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const isAdmin = profile && profile.role === 'admin';
  const isCustomer = profile && profile.role === 'customer';

  const categoryStrip = useMemo(() => (categories || []).slice(0, 10), [categories]);

  if (view === 'loading') {
    return (
      <div className="app-loading">
        <p>Đang tải hệ thống DT13 Store…</p>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div className="app-login">
        <LoginForm onLoggedIn={onLoggedIn} />
      </div>
    );
  }

  let mainContent = null;
  if (view === 'products') {
    mainContent = (
      <ProductList
        profile={profile}
        onSelectProduct={onSelectProduct}
        recoRefreshKey={recoRefreshKey}
        onCategoriesLoaded={setCategories}
        initialCategoryId={activeCategoryId}
      />
    );
  } else if (view === 'productDetail') {
    mainContent = (
      <ProductDetail
        productId={selectedProductId}
        profile={profile}
        onBack={() => goProducts(activeCategoryId)}
        onSelectProduct={onSelectProduct}
        categories={categories}
        onRequireLogin={handleRequireLogin}
      />
    );
  } else if (view === 'history' && isCustomer) {
    mainContent = <MyHistory onBack={() => goProducts()} onSelectProduct={onSelectProduct} />;
  } else if (view === 'admin' && isAdmin) {
    mainContent = <AdminConsole onBack={() => goProducts()} />;
  } else {
    mainContent = (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p className="muted">Trang bạn yêu cầu không tồn tại hoặc không đủ quyền truy cập.</p>
        <button type="button" className="btn-primary" onClick={() => goProducts()}>
          Về Cửa hàng
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Bỏ qua đến nội dung chính</a>

      {/* Semantic Top Header */}
      <header className="app-header" role="banner">
        <div className="app-header__inner page-container">
          <button
            type="button"
            className="app-brand"
            onClick={() => goProducts()}
            aria-label="Gợi Ý - Trang chủ"
          >
            <span className="app-brand__mark" aria-hidden="true">GY</span>
            <span className="app-brand__text">Gợi Ý</span>
          </button>

          <nav className="app-header__nav" aria-label="Điều hướng chính">
            <button
              type="button"
              className={`app-nav__link${view === 'products' ? ' app-nav__link--active' : ''}`}
              onClick={() => goProducts()}
              aria-current={view === 'products' ? 'page' : undefined}
            >
              Cửa hàng
            </button>
            {(!profile || isCustomer) && (
              <button
                type="button"
                className={`app-nav__link${view === 'history' ? ' app-nav__link--active' : ''}`}
                onClick={goHistory}
                aria-current={view === 'history' ? 'page' : undefined}
              >
                Lịch sử
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className={`app-nav__link${view === 'admin' ? ' app-nav__link--active' : ''}`}
                onClick={goAdmin}
                aria-current={view === 'admin' ? 'page' : undefined}
              >
                Quản trị
              </button>
            )}
          </nav>

          <div className="app-account">
            {profile ? (
              <button
                type="button"
                className="app-account__btn"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-label="Thông tin tài khoản"
              >
                <div className="app-account__avatar" aria-hidden="true">
                  {(formatUserDisplayName(profile) || 'U').charAt(0).toUpperCase()}
                </div>
                <span className="app-account__name">{formatUserDisplayName(profile)}</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '8px 18px', fontSize: '0.875rem' }}
                onClick={() => handleRequireLogin('products')}
              >
                Đăng nhập
              </button>
            )}

            {accountMenuOpen && (
              <div className="app-account__menu" role="menu">
                <div className="app-account__menu-info">
                  <strong>{formatUserDisplayName(profile)}</strong>
                  <span className="app-account__menu-role" style={{ display: 'block', fontSize: '0.75rem', color: '#167d69', fontWeight: 600, marginTop: '2px' }}>
                    {isAdmin ? 'Quản trị viên' : 'Khách hàng'}
                  </span>
                  <span className="muted" style={{ display: 'block', marginTop: '2px' }}>{profile?.email}</span>
                </div>
                <button
                  type="button"
                  className="app-account__item app-account__item--logout"
                  role="menuitem"
                  onClick={onLogout}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Category Strip */}
        {categoryStrip.length > 0 && view !== 'admin' && view !== 'history' && (
          <nav className="app-category-strip" aria-label="Danh mục nổi bật">
            <div className="app-category-strip__inner page-container">
              <button
                type="button"
                className={`app-category-strip__chip${!activeCategoryId ? ' app-category-strip__chip--active' : ''}`}
                onClick={() => {
                  setActiveCategoryId(null);
                  goProducts(null);
                  window.dispatchEvent(new CustomEvent('dt13:jump-category', { detail: { categoryId: '' } }));
                }}
              >
                Tất cả sản phẩm
              </button>
              {categoryStrip.map((c) => (
                <button
                  key={c.categoryId}
                  type="button"
                  className={`app-category-strip__chip${activeCategoryId === c.categoryId ? ' app-category-strip__chip--active' : ''}`}
                  onClick={() => {
                    setActiveCategoryId(c.categoryId);
                    goProducts(c.categoryId);
                    window.dispatchEvent(new CustomEvent('dt13:jump-category', { detail: { categoryId: c.categoryId } }));
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content Area */}
      <main className={`app-main${view === 'products' ? '' : ' page-container'}`} id="main-content">
        {mainContent}
      </main>

      {/* Semantic Footer */}
      <footer className="app-footer" role="contentinfo">
        <div className="page-container">
          <div className="app-footer__grid" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px' }}>
            <div>
              <div className="app-footer__brand-title" style={{ fontWeight: 800, fontSize: '1.25rem', color: '#162b28' }}>Gợi Ý</div>
              <p className="app-footer__desc" style={{ color: '#52665e', marginTop: '6px', fontSize: '0.9375rem' }}>
                Chọn món công nghệ hợp với bạn.
              </p>
            </div>
            <div>
              <div className="app-footer__col-title" style={{ fontWeight: 600, fontSize: '0.875rem', color: '#162b28', marginBottom: '8px' }}>Điều hướng</div>
              <ul className="app-footer__list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li><a href="#products" onClick={(e) => { e.preventDefault(); goProducts(); }}>Cửa hàng</a></li>
                {isCustomer && <li><a href="#history" onClick={(e) => { e.preventDefault(); goHistory(); }}>Lịch sử của bạn</a></li>}
                {isAdmin && <li><a href="#admin" onClick={(e) => { e.preventDefault(); goAdmin(); }}>Quản trị</a></li>}
              </ul>
            </div>
          </div>
          <div className="app-footer__bottom" style={{ borderTop: '1px solid #dce5df', marginTop: '24px', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', color: '#72847c', fontSize: '0.8125rem' }}>
            <span>© 2026 Gợi Ý. Tất cả quyền được bảo lưu.</span>
            <span>Cửa hàng công nghệ cá nhân hóa</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <nav className="app-bottom-nav" aria-label="Điều hướng di động">
        <button
          type="button"
          className={`app-bottom-nav__item${view === 'products' ? ' app-bottom-nav__item--active' : ''}`}
          onClick={() => goProducts()}
          aria-current={view === 'products' ? 'page' : undefined}
        >
          <span className="app-bottom-nav__icon" aria-hidden="true">🛍</span>
          <span>Sản phẩm</span>
        </button>
        {isCustomer && (
          <button
            type="button"
            className={`app-bottom-nav__item${view === 'history' ? ' app-bottom-nav__item--active' : ''}`}
            onClick={goHistory}
            aria-current={view === 'history' ? 'page' : undefined}
          >
            <span className="app-bottom-nav__icon" aria-hidden="true">⏱</span>
            <span>Lịch sử</span>
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className={`app-bottom-nav__item${view === 'admin' ? ' app-bottom-nav__item--active' : ''}`}
            onClick={goAdmin}
            aria-current={view === 'admin' ? 'page' : undefined}
          >
            <span className="app-bottom-nav__icon" aria-hidden="true">⚙</span>
            <span>Quản trị</span>
          </button>
        )}
        <button
          type="button"
          className={`app-bottom-nav__item${accountMenuOpen ? ' app-bottom-nav__item--active' : ''}`}
          aria-haspopup="menu"
          onClick={() => setAccountMenuOpen((v) => !v)}
        >
          <span className="app-bottom-nav__icon" aria-hidden="true">👤</span>
          <span>Tài khoản</span>
        </button>
      </nav>
    </div>
  );
}
