import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, formatDateTime } from '../utils/format.js';
import { newEventId } from '../utils/eventId.js';
import { getProductPlaceholderSvg, getProductImageUrl } from '../utils/imageFallback.js';
import {
  setCanonicalUrl,
  setDocumentTitle,
  setMetaDescription,
  setMetaRobots,
  setOpenGraph,
  setProductDetailStructuredData,
} from '../utils/seo.js';
import Recommendations from './Recommendations.jsx';
import '../styles/ProductDetail.css';

function MainProductImage({ src, alt, category, productId }) {
  const [errored, setErrored] = useState(false);
  const resolvedUrl = useMemo(() => getProductImageUrl(productId, src), [productId, src]);
  const fallback = useMemo(() => getProductPlaceholderSvg(category || alt, 600, 450), [category, alt]);

  if (errored || !resolvedUrl) {
    return (
      <img
        className="product-detail__image"
        src={fallback}
        alt={alt || 'Chi tiết sản phẩm'}
        width="600"
        height="450"
      />
    );
  }

  return (
    <img
      className="product-detail__image"
      src={resolvedUrl}
      alt={alt || 'Chi tiết sản phẩm'}
      loading="eager"
      fetchPriority="high"
      decoding="async"
      width="600"
      height="450"
      onError={() => setErrored(true)}
    />
  );
}

export default function ProductDetail({
  productId,
  profile,
  onBack,
  onSelectProduct,
  categories = [],
}) {
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [purchase, setPurchase] = useState({ quantity: 1, pending: false, message: null, error: null });
  const [purchasedEventId, setPurchasedEventId] = useState(null);
  const [coBoughtKey, setCoBoughtKey] = useState(0);
  const viewEventIdRef = useRef(null);
  const viewRecordedRef = useRef(false);

  const isAdmin = profile && profile.role === 'admin';
  const isCustomer = profile && profile.role === 'customer';

  const fetchProduct = useCallback(async () => {
    if (!productId) {
      setStatus({ kind: 'error', error: 'Không tìm thấy thông tin mã sản phẩm hợp lệ.' });
      setProduct(null);
      return;
    }
    setStatus({ kind: 'loading', error: null });
    try {
      const includeInactive = isAdmin;
      const p = await api.getProduct(productId, { includeInactive });
      if (!p || !p.productId) {
        setStatus({ kind: 'error', error: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh.' });
        setProduct(null);
        return;
      }
      setProduct(p);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      setStatus({ kind: 'error', error: err.message || 'Không thể tải thông tin sản phẩm.' });
      setProduct(null);
    }
  }, [productId, isAdmin]);

  useEffect(() => {
    viewRecordedRef.current = false;
    viewEventIdRef.current = null;
    setPurchasedEventId(null);
    setPurchase({ quantity: 1, pending: false, message: null, error: null });
    setCoBoughtKey((k) => k + 1);
    fetchProduct();
  }, [fetchProduct]);

  // Find category name for SEO & Breadcrumbs
  const currentCategory = useMemo(() => {
    if (!product || !categories.length) return null;
    return categories.find((c) => c.categoryId === product.categoryId) || null;
  }, [product, categories]);

  // Dynamic Technical SEO for Product Detail
  useEffect(() => {
    if (product) {
      setDocumentTitle(product.name);
      const desc = product.description
        ? product.description.slice(0, 160)
        : `${product.name} chính hãng tại DT13 Store. Giá bán: ${formatVnd(product.price)} đ. Đồ án NoSQL Neo4j.`;
      setMetaDescription(desc);
      setMetaRobots('index, follow');
      setCanonicalUrl();
      setOpenGraph({
        title: `${product.name} - DT13 Store`,
        description: desc,
        image: product.imageUrl,
        type: 'product',
      });
      setProductDetailStructuredData(product, currentCategory?.name);
    } else {
      setDocumentTitle('Chi tiết sản phẩm');
    }
  }, [product, currentCategory]);

  // Record one VIEWED interaction edge in Neo4j
  useEffect(() => {
    if (!isCustomer || !product || product.active === false) return undefined;
    if (viewRecordedRef.current) return undefined;
    const evt = newEventId('VIEWED');
    viewEventIdRef.current = evt;
    viewRecordedRef.current = true;
    api.recordView({ eventId: evt, productId }).catch(() => {
      /* non-blocking */
    });
    return undefined;
  }, [isCustomer, product, productId]);

  const onPurchase = async (e) => {
    e.preventDefault();
    if (purchase.pending) return;
    setPurchase((p) => ({ ...p, pending: true, error: null, message: null }));
    const evt = purchasedEventId || newEventId('BOUGHT');
    setPurchasedEventId(evt);

    try {
      const res = await api.recordPurchase({
        eventId: evt,
        productId,
        quantity: purchase.quantity,
      });
      setPurchase((p) => ({
        ...p,
        pending: false,
        message: `Mua hàng thành công! Đã lưu cạnh :BOUGHT (${res.quantity} x ${formatVnd(res.unitPrice)} đ) vào Neo4j.`,
        error: null,
      }));
      setCoBoughtKey((k) => k + 1);
      window.dispatchEvent(new CustomEvent('dt13:reco-refresh'));
    } catch (err) {
      setPurchase((p) => ({ ...p, pending: false, error: err.message, message: null }));
    }
  };

  if (status.kind === 'error') {
    return (
      <div className="product-detail-error" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <p className="error-text" style={{ fontSize: '1.125rem', marginBottom: '16px' }}>
          {status.error || 'Không tải được sản phẩm.'}
        </p>
        <button type="button" className="btn-primary" onClick={onBack}>
          ← Quay lại danh sách sản phẩm
        </button>
      </div>
    );
  }

  if (status.kind === 'loading' || !product) {
    return (
      <div className="product-detail-loading" role="status" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="spinner" aria-hidden="true" />
        <p className="muted">Đang tải thông tin sản phẩm…</p>
      </div>
    );
  }

  return (
    <div className="product-detail-page">
      {/* Semantic Breadcrumbs */}
      <nav className="product-detail__breadcrumb" aria-label="Breadcrumb">
        <ol className="breadcrumb-list">
          <li className="breadcrumb-item">
            <button type="button" className="breadcrumb-link" onClick={onBack}>
              Cửa hàng
            </button>
          </li>
          {currentCategory && (
            <li className="breadcrumb-item">
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              <span className="breadcrumb-text">{currentCategory.name}</span>
            </li>
          )}
          <li className="breadcrumb-item breadcrumb-item--current" aria-current="page">
            <span className="breadcrumb-sep" aria-hidden="true">/</span>
            <span className="breadcrumb-current-text">{product.name}</span>
          </li>
        </ol>
      </nav>

      {/* Main Product Showcase: 2-column layout */}
      <div className="product-detail__layout">
        {/* Left Column: Product Image */}
        <div className="product-detail__gallery">
          <div className="product-detail__image-box">
            <MainProductImage
              src={product.imageUrl}
              alt={product.name}
              category={currentCategory?.name || product.categoryId || product.name}
              productId={product.productId}
            />
            {product.brand && <span className="product-detail__brand-tag">{product.brand}</span>}
          </div>
        </div>

        {/* Right Column: Information & Purchase */}
        <div className="product-detail__info">
          <div className="product-detail__meta-top">
            <span className="product-detail__sku">MÃ SẢN PHẨM: <strong>{product.productId}</strong></span>
            {currentCategory && (
              <span className="badge badge--primary">{currentCategory.name}</span>
            )}
            {product.active === false && (
              <span className="badge badge--danger">Ngừng kinh doanh</span>
            )}
          </div>

          {/* Single H1 on Product Detail view */}
          <h1 className="product-detail__title">{product.name}</h1>

          {product.brand && (
            <div className="product-detail__brand-line">
              Thương hiệu: <strong>{product.brand}</strong>
            </div>
          )}

          {/* Large Price Display */}
          <div className="product-detail__price-box">
            <span className="product-detail__price-val">{formatVnd(product.price)}</span>
            <span className="product-detail__price-currency">₫</span>
            <span className="product-detail__vat-tag">(Đã bao gồm VAT)</span>
          </div>

          {/* Description */}
          <div className="product-detail__desc-box">
            <h3 className="product-detail__desc-title">Mô tả sản phẩm:</h3>
            <p className="product-detail__desc">
              {product.description || 'Sản phẩm công nghệ cao cấp phân phối chính hãng tại DT13 Store với chính sách bảo hành 12 tháng.'}
            </p>
          </div>

          {product.createdAt && (
            <div className="product-detail__created small muted">
              Ngày phát hành: {formatDateTime(product.createdAt)}
            </div>
          )}

          {/* Purchase Form (Customer role only) */}
          {isCustomer && product.active !== false && (
            <div className="product-detail__purchase-card">
              <h2 className="product-detail__purchase-title">
                <span aria-hidden="true">🛒</span> Đặt mua sản phẩm (Mô phỏng Giao dịch)
              </h2>
              <p className="muted small">
                Thao tác mua sẽ tạo một cạnh <code>:BOUGHT</code> trong Neo4j. Hệ thống sẽ ngay lập tức tính toán lại gợi ý tương quan.
              </p>

              <form onSubmit={onPurchase} className="purchase-form">
                <div className="purchase-form__row">
                  <div className="purchase-form__quantity-wrap">
                    <label htmlFor="buy-quantity" className="visually-hidden">Số lượng</label>
                    <button
                      type="button"
                      className="quantity-btn"
                      onClick={() => setPurchase((p) => ({ ...p, quantity: Math.max(1, p.quantity - 1) }))}
                      disabled={purchase.quantity <= 1 || purchase.pending}
                      aria-label="Giảm số lượng"
                    >
                      -
                    </button>
                    <input
                      id="buy-quantity"
                      type="number"
                      min={1}
                      max={100}
                      className="quantity-input"
                      value={purchase.quantity}
                      onChange={(e) => setPurchase((p) => ({ ...p, quantity: Math.max(1, Number(e.target.value) || 1) }))}
                      disabled={purchase.pending}
                    />
                    <button
                      type="button"
                      className="quantity-btn"
                      onClick={() => setPurchase((p) => ({ ...p, quantity: p.quantity + 1 }))}
                      disabled={purchase.pending}
                      aria-label="Tăng số lượng"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary purchase-form__submit"
                    disabled={purchase.pending}
                    aria-busy={purchase.pending}
                  >
                    {purchase.pending ? 'Đang lưu Neo4j…' : 'Mua ngay (Ghi cạnh :BOUGHT)'}
                  </button>
                </div>

                {purchase.error && (
                  <div className="error-text" role="alert">
                    {purchase.error}
                  </div>
                )}

                {purchase.message && (
                  <div className="success-text" role="status">
                    <span aria-hidden="true">✓</span>
                    <span>{purchase.message}</span>
                  </div>
                )}
              </form>
            </div>
          )}

          {isCustomer && product.active === false && (
            <div className="error-text">
              Sản phẩm này hiện đang ngừng kinh doanh. Quý khách vui lòng tham khảo các gợi ý tương tự bên dưới.
            </div>
          )}
        </div>
      </div>

      {/* Frequently Co-Bought Recommendations (mode="product") */}
      {isCustomer && (
        <section className="product-detail__co-bought" aria-label="Sản phẩm thường được mua cùng">
          <Recommendations
            key={`co-${productId}-${coBoughtKey}`}
            mode="product"
            productId={productId}
            onSelectProduct={onSelectProduct}
            refreshKey={coBoughtKey}
            title="Sản phẩm thường được mua cùng"
            maxItems={4}
          />
        </section>
      )}
    </div>
  );
}
