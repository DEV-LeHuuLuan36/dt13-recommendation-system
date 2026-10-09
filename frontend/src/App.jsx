import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMe } from './api/auth.js';
import LoginForm from './components/LoginForm.jsx';
import ProductList from './components/ProductList.jsx';
import ProductDetail from './components/ProductDetail.jsx';
import MyHistory from './components/MyHistory.jsx';
import AdminConsole from './components/admin/AdminConsole.jsx';
import { setDocumentTitle, setMetaRobots } from './utils/seo.js';
import './styles/App.css';

// Per-view SEO: title and robots meta.
function applySeo(view) {
  if (view === 'login') {
    setDocumentTitle('Đăng nhập - Gợi Ý');
    setMetaRobots('noindex,nofollow');
    return;
  }
  if (view === 'history') {
    setDocumentTitle('Lịch sử của tôi - Gợi Ý');
    setMetaRobots('noindex,nofollow');
    return;
  }
  if (view === 'admin') {
    setDocumentTitle('Quản trị - Gợi Ý');
    setMetaRobots('noindex,nofollow');
    return;
  }
  if (view === 'productDetail') {
    setDocumentTitle('Chi tiết sản phẩm - Gợi Ý');
    setMetaRobots('index,follow');
    return;
  }
  if (view === 'products') {
    setDocumentTitle('Khám phá sản phẩm - Gợi Ý');
    setMetaRobots('index,follow');
    return;
  }
  setDocumentTitle('Gợi Ý');
  setMetaRobots('noindex,nofollow');
}

export default function App() {
  const [view, setView] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [recoRefreshKey, setRecoRefreshKey] = useState(0);
  const [categories, setCategories] = useState([]);

  const restoreSession = useCallback(async () => {
    try {
      const me = await fetchMe();
      if (me) {
        setProfile(me);
        setView(me.role === 'admin' ? 'admin' : 'products');
      } else {
        setView('login');
      }
    } catch {
      setView('login');
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    function onReco() { setRecoRefreshKey((k) => k + 1); }
    window.addEventListener('dt13:reco-refresh', onReco);
    return () => window.removeEventListener('dt13:reco-refresh', onReco);
  }, []);

  useEffect(() => { applySeo(view); }, [view]);

  const onLoggedIn = useCallback((p) => {
    setProfile(p);
    setView(p.role === 'admin' ? 'admin' : 'products');
  }, []);

  const onLogout = useCallback(async () => {
    setAccountMenuOpen(false);
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* ignore */ }
    setProfile(null);
    setView('login');
  }, []);

  const onSelectProduct = useCallback((productId) => {
    setSelectedProductId(productId);
    setView('productDetail');
    setAccountMenuOpen(false);
  }, []);

  const goProducts = useCallback(() => { setView('products'); setAccountMenuOpen(false); }, []);
  const goHistory = useCallback(() => { setView('history'); setAccountMenuOpen(false); }, []);
  const goAdmin = useCallback(() => { setView('admin'); setAccountMenuOpen(false); }, []);

  const isAdmin = profile && profile.role === 'admin';
  const isCustomer = profile && profile.role === 'customer';

  const categoryStrip = useMemo(() => (categories || []).slice(0, 10), [categories]);

  if (view === 'loading') {
    return (
      <div className="app-loading">
        <p>Đang khôi phục phiên…</p>
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

  let main = null;
  if (view === 'products') {
    main = (
      <ProductList
        profile={profile}
        onSelectProduct={onSelectProduct}
        recoRefreshKey={recoRefreshKey}
        onCategoriesLoaded={setCategories}
      />
    );
  } else if (view === 'productDetail') {
    main = (
      <ProductDetail
        productId={selectedProductId}
        profile={profile}
        onBack={goProducts}
        onSelectProduct={onSelectProduct}
      />
    );
  } else if (view === 'history' && isCustomer) {
    main = <MyHistory onBack={goProducts} onSelectProduct={onSelectProduct} />;
  } else if (view === 'admin' && isAdmin) {
    main = <AdminConsole onBack={goProducts} />;
  } else {
    main = <p className="muted">Không có nội dung.</p>;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Bỏ qua đến nội dung chính</a>
      <header className="app-header" role="banner">
        <div className="app-header__inner page-container">
          <button
            type="button"
            className="app-brand"
            onClick={goProducts}
            aria-label="Gợi Ý - Trang chủ"
          >
            <span className="app-brand__mark" aria-hidden="true">G</span>
            <span className="app-brand__text">Gợi Ý</span>
          </button>

          <nav className="app-header__nav" aria-label="Điều hướng chính">
            <button
              type="button"
              className={`app-nav__link${view === 'products' ? ' app-nav__link--active' : ''}`}
              onClick={goProducts}
              aria-current={view === 'products' ? 'page' : undefined}
            >
              Sản phẩm
            </button>
            {isCustomer && (
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
            <button
              type="button"
              className="app-account__btn"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen((v) => !v)}
            >
              <span className="app-account__name">{profile.name || profile.email}</span>
              <span className="app-account__role">{isAdmin ? 'Quản trị viên' : 'Khách hàng'}</span>
            </button>
            {accountMenuOpen && (
              <div className="app-account__menu" role="menu">
                <div className="app-account__menu-info">
                  <strong>{profile.name || profile.email}</strong>
                  <span className="muted">{profile.email}</span>
                </div>
                <button
                  type="button"
                  className="app-account__item"
                  role="menuitem"
                  onClick={onLogout}
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>

        {categoryStrip.length > 0 && view !== 'admin' && view !== 'history' && (
          <div className="app-category-strip" aria-label="Danh mục nổi bật">
            <div className="app-category-strip__inner page-container">
              {categoryStrip.map((c) => (
                <button
                  key={c.categoryId}
                  type="button"
                  className="app-category-strip__chip"
                  onClick={() => {
                    setView('products');
                    window.dispatchEvent(new CustomEvent('dt13:jump-category', { detail: { categoryId: c.categoryId } }));
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="app-main page-container" id="main">
        {main}
      </main>

      <nav className="app-bottom-nav" aria-label="Điều hướng di động">
        <button
          type="button"
          className={`app-bottom-nav__item${view === 'products' ? ' app-bottom-nav__item--active' : ''}`}
          onClick={goProducts}
          aria-current={view === 'products' ? 'page' : undefined}
        >
          <span className="app-bottom-nav__icon" aria-hidden="true">▦</span>
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
        <button
          type="button"
          className={`app-bottom-nav__item${accountMenuOpen ? ' app-bottom-nav__item--active' : ''}`}
          aria-haspopup="menu"
          onClick={() => setAccountMenuOpen((v) => !v)}
        >
          <span className="app-bottom-nav__icon" aria-hidden="true">◉</span>
          <span>Tài khoản</span>
        </button>
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
      </nav>
    </div>
  );
}
