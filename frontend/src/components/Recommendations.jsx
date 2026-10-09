import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd } from '../utils/format.js';
import '../styles/Recommendations.css';

const HEADINGS = {
  me: 'Dành cho bạn',
  product: 'Thường được mua cùng',
};

function fallbackSvg(alt) {
  const text = (alt || 'SP').slice(0, 14);
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="#167d69"/><text x="100" y="78" text-anchor="middle" fill="white" font-family="sans-serif" font-size="16">${text}</text></svg>`
  )}`;
}

function Thumb({ src, alt }) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return <img className="reco__thumb" src={fallbackSvg(alt)} alt={alt || 'Sản phẩm'} loading="lazy" width="80" height="60" />;
  }
  return <img className="reco__thumb" src={src} alt={alt || 'Sản phẩm'} loading="lazy" width="80" height="60" onError={() => setErrored(true)} />;
}

export default function Recommendations({ mode = 'me', productId = null, onSelectProduct, title, refreshKey = 0, maxItems = 4 }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [showWhy, setShowWhy] = useState(false);
  const requestSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const mySeq = ++requestSeq.current;
    setStatus({ kind: 'loading', error: null });
    try {
      const res = mode === 'product'
        ? await api.recommendForProduct(productId, { limit: maxItems })
        : await api.recommendForMe({ limit: maxItems });
      if (mySeq !== requestSeq.current) return;
      setData(res);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (mySeq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message });
      setData(null);
    }
  }, [mode, productId, maxItems]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const heading = title || HEADINGS[mode] || 'Gợi ý';
  const items = (data && data.items) || [];
  const reason = (data && data.reason) || '';
  const method = (data && data.method) || (mode === 'me' ? 'user_cf' : 'co_bought');

  return (
    <section className="reco" aria-label={heading}>
      <header className="reco__header">
        <h2 className="reco__title">{heading}</h2>
        <button
          type="button"
          className="reco__why"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
        >
          {showWhy ? 'Ẩn lý do' : 'Vì sao gợi ý?'}
        </button>
      </header>
      {showWhy && (
        <p className="reco__why-text">
          {reason || (mode === 'me'
            ? 'Gợi ý dựa trên sản phẩm những người dùng giống bạn đã mua.'
            : 'Gợi ý dựa trên những người đã mua sản phẩm này.')}
        </p>
      )}

      {status.kind === 'loading' && !data && <p className="muted" role="status">Đang tải gợi ý…</p>}
      {status.kind === 'error' && (
        <div className="error-text" role="alert">
          Không tải được gợi ý. Vui lòng thử lại.
          <div><button type="button" className="btn-ghost" onClick={fetchData}>Tải lại</button></div>
        </div>
      )}

      {status.kind !== 'loading' && items.length === 0 && (
        <p className="muted reco__empty">
          {reason || (mode === 'me' ? 'Chưa có gợi ý. Hãy mua thêm sản phẩm để hệ thống hiểu bạn hơn.' : 'Chưa có gợi ý cho sản phẩm này.')}
        </p>
      )}

      {items.length > 0 && (
        <ul className="reco__list">
          {items.map((it) => (
            <li key={it.productId} className="reco__item">
              {onSelectProduct ? (
                <button
                  type="button"
                  className="reco__open"
                  onClick={() => onSelectProduct(it.productId)}
                  aria-label={`Xem gợi ý ${it.name}`}
                >
                  <Thumb src={it.imageUrl} alt={it.name} />
                  <div className="reco__body">
                    {it.brand && <p className="reco__brand">{it.brand}</p>}
                    <h3 className="reco__name">{it.name}</h3>
                    <p className="reco__price">{formatVnd(it.price)} đ</p>
                  </div>
                </button>
              ) : (
                <div className="reco__body">
                  <h3 className="reco__name">{it.name}</h3>
                  <p className="reco__price">{formatVnd(it.price)} đ</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* method/reason are surfaced via the "Why these?" disclosure to keep the UI clean. */}
      <p className="visually-hidden">Phương pháp: {method}</p>
    </section>
  );
}
