import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, formatDateTime } from '../utils/format.js';
import { setDocumentTitle } from '../utils/seo.js';
import '../styles/MyHistory.css';

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'bought', label: 'Đã mua' },
  { key: 'viewed', label: 'Đã xem' },
];

function fallbackSvg(alt) {
  const text = (alt || 'SP').slice(0, 18);
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="#dce5df"/><text x="100" y="78" text-anchor="middle" fill="#162b28" font-family="sans-serif" font-size="18">${text}</text></svg>`
  )}`;
}

function Thumbnail({ src, alt }) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return <img className="my-history__thumb" src={fallbackSvg(alt)} alt={alt || 'Sản phẩm'} width="72" height="56" loading="lazy" />;
  }
  return <img className="my-history__thumb" src={src} alt={alt || 'Sản phẩm'} width="72" height="56" loading="lazy" onError={() => setErrored(true)} />;
}

export default function MyHistory({ onBack, onSelectProduct }) {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const requestSeq = useRef(0);

  useEffect(() => { setDocumentTitle('Lịch sử của tôi - Gợi Ý'); }, []);

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

  useEffect(() => { setPage(1); }, [tab]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="my-history" aria-label="Lịch sử của tôi">
      <button type="button" className="btn-ghost my-history__back" onClick={onBack}>
        ← Quay lại
      </button>
      <h1>Lịch sử của tôi</h1>
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

      {status.kind === 'loading' && <p className="muted" role="status">Đang tải…</p>}
      {status.kind === 'error' && (
        <div className="error-text" role="alert">
          Không tải được lịch sử. Vui lòng thử lại.
          <div><button type="button" className="btn-ghost" onClick={fetchData}>Thử lại</button></div>
        </div>
      )}

      {status.kind !== 'loading' && items.length === 0 && (
        <p className="muted">{tab === 'bought' ? 'Bạn chưa mua sản phẩm nào.' : tab === 'viewed' ? 'Bạn chưa xem sản phẩm nào.' : 'Bạn chưa có hoạt động nào.'}</p>
      )}

      <ul className="my-history__list">
        {items.map((item) => (
          <li key={`${item.type}-${item.eventId}`} className="my-history__item">
            <div className="my-history__head">
              <span className={`badge${item.type === 'bought' ? ' badge--primary' : ''}`}>
                {item.type === 'bought' ? 'Đã mua' : 'Đã xem'}
              </span>
              <span className="my-history__time">{formatDateTime(item.occurredAt)}</span>
            </div>
            <button
              type="button"
              className="my-history__product"
              onClick={() => item.productId && onSelectProduct(item.productId)}
            >
              <Thumbnail src={item.productImageUrl} alt={item.productName} />
              <div className="my-history__product-body">
                <strong>{item.productName || item.productId || 'Sản phẩm'}</strong>
                {item.productActive === false && <span className="badge badge--warn">Ngừng KD</span>}
              </div>
            </button>
            {item.type === 'bought' && (
              <p className="my-history__meta">
                Số lượng: {item.quantity} - Đơn giá: {formatVnd(item.unitPrice)} đ - Tổng: {formatVnd(item.quantity * item.unitPrice)} đ
              </p>
            )}
          </li>
        ))}
      </ul>

      <footer className="my-history__footer">
        <span className="muted">
          Trang {page} / {totalPages} (tổng {total})
        </span>
        <div className="pagination">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Trước
          </button>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Sau
          </button>
        </div>
      </footer>
    </section>
  );
}
