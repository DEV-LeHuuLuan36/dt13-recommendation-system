import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, formatDateTime } from '../utils/format.js';
import { newEventId } from '../utils/eventId.js';
import { setDocumentTitle, setMetaDescription } from '../utils/seo.js';
import Recommendations from './Recommendations.jsx';
import '../styles/ProductDetail.css';

function fallbackSvg(alt) {
  const text = (alt || 'Sản phẩm').slice(0, 24);
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360"><rect width="600" height="360" fill="#167d69"/><text x="300" y="200" text-anchor="middle" fill="white" font-family="sans-serif" font-size="40">${text}</text></svg>`
  )}`;
}

function ProductImage({ src, alt }) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return <img className="product-detail__image" src={fallbackSvg(alt)} alt={alt || 'Sản phẩm'} width="600" height="360" />;
  }
  return <img className="product-detail__image" src={src} alt={alt || 'Sản phẩm'} loading="eager" decoding="async" width="600" height="360" onError={() => setErrored(true)} />;
}

export default function ProductDetail({ productId, profile, onBack, onSelectProduct }) {
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
    setStatus({ kind: 'loading', error: null });
    try {
      const includeInactive = isAdmin;
      const p = await api.getProduct(productId, { includeInactive });
      setProduct(p);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      setStatus({ kind: 'error', error: err.message });
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

  useEffect(() => {
    if (product) {
      const title = `${product.name} - Gợi Ý`;
      setDocumentTitle(title);
      const desc = product.description
        ? product.description.slice(0, 160)
        : `${product.name} - ${formatVnd(product.price)} đ`;
      setMetaDescription(desc);
    } else {
      setDocumentTitle('Chi tiết sản phẩm - Gợi Ý');
    }
  }, [product]);

  // Record one VIEWED event when a customer opens the detail view.
  useEffect(() => {
    if (!isCustomer || !product || product.active === false) return undefined;
    if (viewRecordedRef.current) return undefined;
    const evt = newEventId('VIEWED');
    viewEventIdRef.current = evt;
    viewRecordedRef.current = true;
    // A failed write is non-blocking for the page.
    api.recordView({ eventId: evt, productId })
      .catch(() => { /* ignored */ });
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
        message: `Đã ghi mua ${res.quantity} x ${formatVnd(res.unitPrice)} đ.`,
        error: null,
      }));
      setCoBoughtKey((k) => k + 1);
      window.dispatchEvent(new CustomEvent('dt13:reco-refresh'));
    } catch (err) {
      setPurchase((p) => ({ ...p, pending: false, error: err.message, message: null }));
    }
  };

  if (status.kind === 'loading') return <p className="muted" role="status">Đang tải…</p>;
  if (status.kind === 'error') {
    return (
      <section className="product-detail" aria-label="Chi tiết sản phẩm">
        <p className="error-text">Không tải được sản phẩm. Vui lòng thử lại.</p>
        <button type="button" className="btn-ghost" onClick={onBack}>Quay lại</button>
      </section>
    );
  }
  if (!product) return null;

  return (
    <section className="product-detail" aria-label="Chi tiết sản phẩm">
      <nav className="product-detail__breadcrumb" aria-label="Breadcrumb">
        <a href="#products" onClick={(e) => { e.preventDefault(); onBack(); }}>Sản phẩm</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>
      <div className="product-detail__grid">
        <div className="product-detail__image-wrap">
          <ProductImage src={product.imageUrl} alt={product.name} />
        </div>
        <div className="product-detail__info">
          {product.brand && <p className="product-detail__brand">{product.brand}</p>}
          <h1 className="product-detail__name">{product.name}</h1>
          {product.model && <p className="muted">Mã: {product.model}</p>}
          <p className="product-detail__price">{formatVnd(product.price)} đ</p>
          {product.active === false && <p className="badge badge--warn">Sản phẩm đang ngừng kinh doanh</p>}
          {product.description && <p className="product-detail__desc">{product.description}</p>}
          {product.createdAt && (
            <p className="muted small">Tạo lúc: {formatDateTime(product.createdAt)}</p>
          )}

          {isCustomer && product.active !== false && (
            <form className="purchase-form" onSubmit={onPurchase} aria-label="Mua mô phỏng">
              <h2>Mua mô phỏng</h2>
              <p className="muted">Ghi một BOUGHT. Retry cùng eventId trả về kết quả giống, không tạo giao dịch mới.</p>
              <label className="purchase-form__quantity">
                <span>Số lượng</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={purchase.quantity}
                  onChange={(e) => setPurchase((p) => ({ ...p, quantity: Number(e.target.value) }))}
                  required
                />
              </label>
              {purchase.error && <p className="error-text" role="alert">{purchase.error}</p>}
              {purchase.message && <p className="success-text" role="status">{purchase.message}</p>}
              <button type="submit" className="btn-primary purchase-form__submit" disabled={purchase.pending} aria-busy={purchase.pending}>
                {purchase.pending ? 'Đang ghi…' : 'Mua ngay'}
              </button>
            </form>
          )}

          {isCustomer && product.active === false && (
            <p className="muted">Sản phẩm đang ngừng kinh doanh, bạn không thể mua thêm.</p>
          )}

          {isAdmin && product.active === false && (
            <p className="muted">Sản phẩm này đang ở trạng thái ngừng kinh doanh. Khách hàng sẽ không thấy trên trang chính.</p>
          )}
        </div>
      </div>

      {isCustomer && (
        <Recommendations
          key={`co-${productId}-${coBoughtKey}`}
          mode="product"
          productId={productId}
          onSelectProduct={onSelectProduct}
          refreshKey={coBoughtKey}
          title="Thường được mua cùng"
          maxItems={4}
        />
      )}
    </section>
  );
}
