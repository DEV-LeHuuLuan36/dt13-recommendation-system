import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, formatDateTime } from '../utils/format.js';
import { getCategoryIconPaths, getProductImageUrl } from '../utils/imageFallback.js';
import { setDocumentTitle, setMetaDescription, setMetaRobots } from '../utils/seo.js';
import '../styles/MyHistory.css';

const TABS = [
  { key: 'all', label: 'Tất cả hoạt động' },
  { key: 'bought', label: 'Đã mua (BOUGHT)' },
  { key: 'viewed', label: 'Đã xem (VIEWED)' },
];

function HistoryItemThumbnail({ src, alt, category, productId }) {
  const [errored, setErrored] = useState(false);
  const resolvedUrl = useMemo(() => getProductImageUrl(productId, src), [productId, src]);

  if (!errored && resolvedUrl) {
    return (
      <img
        className="history-thumb-img"
        src={resolvedUrl}
        alt={alt || 'Sản phẩm'}
        width="44"
        height="44"
        onError={() => setErrored(true)}
      />
    );
  }

  const iconPaths = getCategoryIconPaths(category || alt);
  return (
    <div className="history-thumb-icon" aria-hidden="true" title={category || 'Thiết bị'}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        dangerouslySetInnerHTML={{ __html: iconPaths }}
      />
    </div>
  );
}

export default function MyHistory({ onBack, onSelectProduct }) {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const requestSeq = useRef(0);

  useEffect(() => {
    setDocumentTitle('Lịch sử của tôi');
    setMetaDescription('Lịch sử mua sắm và xem sản phẩm đã được lưu trữ trong đồ thị Neo4j.');
    setMetaRobots('noindex, nofollow');
  }, []);

  const fetchData = useCallback(async () => {
    const mySeq = ++requestSeq.current;
    setStatus({ kind: 'loading', error: null });
    try {
      const data = await api.listHistory({ type: tab, page, pageSize });
      if (mySeq !== requestSeq.current) return;
      setItems(data.items);
      setTotal(data.total);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (mySeq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message });
    }
  }, [tab, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="my-history-page">
      <div className="my-history__header">
        <button type="button" className="btn-ghost my-history__back" onClick={onBack}>
          ← Quay lại cửa hàng
        </button>
        {/* Single H1 on History View */}
        <h1>Lịch sử mua sắm & Tương tác</h1>
        <p className="muted">
          Nhật ký các cạnh quan hệ <code>:BOUGHT</code> và <code>:VIEWED</code> giữa tài khoản của bạn và các sản phẩm trong Neo4j.
        </p>

        {/* Tab Selection */}
        <div className="my-history__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`my-history__tab${tab === t.key ? ' my-history__tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {status.kind === 'loading' && (
        <div className="my-history__loading" role="status">
          <div className="spinner small" aria-hidden="true" />
          <p className="muted">Đang tải lịch sử giao dịch…</p>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="error-text" role="alert">
          <p>Không tải được lịch sử: {status.error}</p>
          <button type="button" className="btn-ghost small" onClick={fetchData}>Thử lại</button>
        </div>
      )}

      {status.kind !== 'loading' && items.length === 0 && (
        <div className="my-history__empty">
          <span className="empty-icon" aria-hidden="true">⏱</span>
          <p className="muted">
            {tab === 'bought'
              ? 'Bạn chưa mua sản phẩm nào.'
              : tab === 'viewed'
              ? 'Bạn chưa có lịch sử xem sản phẩm nào.'
              : 'Bạn chưa có hoạt động nào trong hệ thống.'}
          </p>
          <button type="button" className="btn-primary" onClick={onBack}>
            Khám phá sản phẩm ngay
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="my-history__list">
          {items.map((item) => (
            <article key={`${item.type}-${item.eventId}`} className="history-row">
              {/* Left Column: Status SVG + 44x44 Category Icon + Product Name & SKU */}
              <div className="history-row__left">
                {item.type === 'bought' ? (
                  <span className="history-status-badge history-status-badge--bought" title="Đã mua (:BOUGHT)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="8" cy="21" r="1"/>
                      <circle cx="19" cy="21" r="1"/>
                      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
                    </svg>
                  </span>
                ) : (
                  <span className="history-status-badge history-status-badge--viewed" title="Đã xem (:VIEWED)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </span>
                )}

                <HistoryItemThumbnail
                  src={item.productImageUrl}
                  alt={item.productName}
                  category={item.categoryName || item.productName || item.productId}
                  productId={item.productId}
                />

                <div className="history-row__info">
                  <h3 className="history-row__name" title={item.productName}>
                    {item.productName || item.productId || 'Sản phẩm'}
                  </h3>
                  <div className="history-row__sku">
                    Mã SP: <code>{item.productId}</code>
                  </div>
                </div>
              </div>

              {/* Middle Column: Quantity & Unit Price (BOUGHT) or Interaction Type (VIEWED) */}
              <div className="history-row__mid">
                {item.type === 'bought' ? (
                  <div className="history-row__meta-pair">
                    <span className="meta-label">Số lượng & Đơn giá:</span>
                    <span className="meta-val">
                      <strong>{item.quantity}</strong> × {formatVnd(item.unitPrice)} ₫
                    </span>
                  </div>
                ) : (
                  <div className="history-row__meta-pair">
                    <span className="meta-label">Hoạt động:</span>
                    <span className="meta-val text-blue">Đã xem chi tiết sản phẩm</span>
                  </div>
                )}
              </div>

              {/* Right Column: Total Price + Occurred Timestamp + View Product Button */}
              <div className="history-row__right">
                <div className="history-row__financial">
                  {item.type === 'bought' ? (
                    <div className="history-row__total">
                      <span className="meta-label">Tổng tiền:</span>
                      <span className="total-val">{formatVnd(item.quantity * item.unitPrice)} ₫</span>
                    </div>
                  ) : (
                    <div className="history-row__total">
                      <span className="meta-label">Tương tác:</span>
                      <span className="view-val">1 lượt xem</span>
                    </div>
                  )}
                  <time className="history-row__time" dateTime={item.occurredAt}>
                    {formatDateTime(item.occurredAt)}
                  </time>
                </div>

                <button
                  type="button"
                  className="btn-outline history-row__action-btn"
                  onClick={() => item.productId && onSelectProduct(item.productId)}
                  aria-label={`Xem lại sản phẩm ${item.productName || item.productId}`}
                >
                  Xem sản phẩm
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <footer className="my-history__footer">
          <span className="muted small">
            Trang {page} / {totalPages} (Tổng {total} bản ghi)
          </span>
          <div className="pagination">
            <button
              type="button"
              className="pagination__btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ← Trước
            </button>
            <span className="pagination__current">{page}</span>
            <button
              type="button"
              className="pagination__btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Sau →
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
