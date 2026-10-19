import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, formatDateTime } from '../utils/format.js';
import { getCategoryIconPaths, getProductImageUrl } from '../utils/imageFallback.js';
import { setDocumentTitle, setMetaDescription, setMetaRobots } from '../utils/seo.js';
import '../styles/MyHistory.css';

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'bought', label: 'Đã mua' },
  { key: 'viewed', label: 'Đã xem' },
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
        width="60"
        height="60"
        loading="lazy"
        onError={() => setErrored(true)}
      />
    );
  }

  const iconPaths = getCategoryIconPaths(category || alt);
  return (
    <div className="history-thumb-icon" aria-hidden="true">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        dangerouslySetInnerHTML={{ __html: iconPaths }}
      />
    </div>
  );
}

/**
 * Formats date into a clean Vietnamese group header label (e.g. "19 tháng 10, 2026")
 */
function formatDateGroup(dateString) {
  if (!dateString) return 'Gần đây';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 'Gần đây';
  return d.toLocaleDateString('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
    setDocumentTitle('Lịch sử của bạn');
    setMetaDescription('Lịch sử mua sắm và xem sản phẩm của bạn.');
    setMetaRobots('noindex, nofollow');
  }, []);

  const fetchData = useCallback(async () => {
    const mySeq = ++requestSeq.current;
    setStatus({ kind: 'loading', error: null });
    try {
      const data = await api.listHistory({ type: tab, page, pageSize });
      if (mySeq !== requestSeq.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
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

  // Group items by date for clean readability
  const groupedItems = useMemo(() => {
    const groups = [];
    let currentGroup = null;

    for (const item of items) {
      const dateKey = formatDateGroup(item.occurredAt);
      if (!currentGroup || currentGroup.dateKey !== dateKey) {
        currentGroup = { dateKey, entries: [] };
        groups.push(currentGroup);
      }
      currentGroup.entries.push(item);
    }
    return groups;
  }, [items]);

  return (
    <div className="my-history-page">
      <div className="my-history__header">
        <button type="button" className="btn-ghost my-history__back" onClick={onBack}>
          ← Quay lại cửa hàng
        </button>
        {/* Single H1 on History View */}
        <h1>Lịch sử của bạn</h1>
        <p className="muted">
          Theo dõi các sản phẩm bạn đã xem và đặt mua.
        </p>

        {/* Clean Tab Selection: Tất cả, Đã mua, Đã xem */}
        <div className="my-history__tabs" role="tablist" aria-label="Bộ lọc lịch sử">
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
          <p className="muted">Đang tải lịch sử…</p>
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
              : 'Bạn chưa có hoạt động nào.'}
          </p>
          <button type="button" className="btn-primary" onClick={onBack}>
            Khám phá sản phẩm ngay
          </button>
        </div>
      )}

      {/* Date-grouped History List */}
      {items.length > 0 && (
        <div className="my-history__list">
          {groupedItems.map((group) => (
            <section key={group.dateKey} className="history-group" aria-label={group.dateKey}>
              <div className="history-group__date-header">
                {group.dateKey}
              </div>

              <div className="history-group__items">
                {group.entries.map((item) => {
                  const productUrl = `/?view=product&id=${encodeURIComponent(item.productId)}`;
                  return (
                    <article key={`${item.type}-${item.eventId}`} className="history-row">
                      {/* Left Column: Image thumbnail + Name */}
                      <div className="history-row__left">
                        <a
                          href={productUrl}
                          onClick={(e) => {
                            e.preventDefault();
                            if (item.productId && onSelectProduct) onSelectProduct(item.productId);
                          }}
                          className="history-row__thumb-link"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          <HistoryItemThumbnail
                            src={item.productImageUrl}
                            alt={item.productName}
                            category={item.categoryName || item.productName}
                            productId={item.productId}
                          />
                        </a>

                        <div className="history-row__info">
                          <div className="history-row__type-badge">
                            {item.type === 'bought' ? (
                              <span className="badge-bought">Đã mua</span>
                            ) : (
                              <span className="badge-viewed">Đã xem</span>
                            )}
                            <time className="history-row__time" dateTime={item.occurredAt}>
                              {formatDateTime(item.occurredAt)}
                            </time>
                          </div>

                          <h3 className="history-row__name" title={item.productName}>
                            <a
                              href={productUrl}
                              onClick={(e) => {
                                e.preventDefault();
                                if (item.productId && onSelectProduct) onSelectProduct(item.productId);
                              }}
                            >
                              {item.productName || 'Sản phẩm'}
                            </a>
                          </h3>
                        </div>
                      </div>

                      {/* Middle Column: Purchase Financials (Unit price at purchase, quantity, total) */}
                      <div className="history-row__mid">
                        {item.type === 'bought' && (
                          <div className="history-row__meta-pair">
                            <span className="meta-val">
                              {item.quantity} × {formatVnd(item.unitPrice)} ₫
                            </span>
                            <span className="total-val">
                              Tổng: {formatVnd(item.quantity * item.unitPrice)} ₫
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right Column: View Product Action */}
                      <div className="history-row__right">
                        <a
                          href={productUrl}
                          className="btn-outline history-row__action-btn"
                          onClick={(e) => {
                            e.preventDefault();
                            if (item.productId && onSelectProduct) onSelectProduct(item.productId);
                          }}
                          aria-label={`Xem lại sản phẩm ${item.productName || item.productId}`}
                        >
                          Xem sản phẩm
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <footer className="my-history__footer">
          <span className="muted small">
            Trang {page} / {totalPages} (Tổng {total} hoạt động)
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
        </footer>
      )}
    </div>
  );
}
