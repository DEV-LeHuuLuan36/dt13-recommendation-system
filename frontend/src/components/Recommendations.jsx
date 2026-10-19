import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import ProductCard from './ProductCard.jsx';
import { createRecommendationController } from '../utils/recommendationController.js';
import { newEventId, getVisitId } from '../utils/eventId.js';
import '../styles/Recommendations.css';

const VISIBLE_COUNT = 4;

export default function Recommendations({
  mode = 'hybrid',
  productId = null,
  excludeProductId = null,
  customerId = null,
  onSelectProduct,
  title = 'Dành cho bạn',
  refreshKey = 0,
  maxItems = 8,
  showCrossCategory = false,
}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissedMap, setDismissedMap] = useState({});
  const [undoToast, setUndoToast] = useState(null);
  const activeCustomerRef = useRef(customerId);

  useEffect(() => {
    activeCustomerRef.current = customerId;
  }, [customerId]);

  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createRecommendationController({
      getCustomerId: () => activeCustomerRef.current,
      onStartLoading: () => setStatus({ kind: 'loading', error: null }),
      onSuccess: (res) => {
        setData(res);
        setCurrentIndex(0);
        setStatus({ kind: 'ready', error: null });
      },
      onError: (err) => {
        setStatus({ kind: 'error', error: err.message });
        setData(null);
      },
      fetchFn: (params, opts) => {
        if (mode === 'me') {
          return api.recommendForMe(params, opts);
        }
        return api.getHybridFeed({
          ...params,
          visitId: getVisitId(),
          feedId: 'home_feed',
        }, opts);
      },
    });
  }

  const fetchData = useCallback(async () => {
    const params = {
      limit: Math.max(8, maxItems),
      pageSize: Math.max(8, maxItems),
    };
    const effectiveExcludeId = excludeProductId || (mode === 'product' ? productId : null);
    if (effectiveExcludeId) {
      params.excludeProductId = effectiveExcludeId;
    }
    await controllerRef.current.fetch(params);
  }, [maxItems, excludeProductId, mode, productId]);

  useEffect(() => {
    setData(null);
    fetchData();
    return () => {
      controllerRef.current?.abort();
    };
  }, [fetchData, refreshKey, customerId]);

  const handleDismiss = useCallback((pId) => {
    setDismissedMap((prev) => ({ ...prev, [pId]: true }));
    const evtId = newEventId('dsm');
    api.dismissRecommendation({ eventId: evtId, productId: pId, feedId: 'home_feed' }).catch(() => {});
    setUndoToast({ productId: pId, eventId: evtId });
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoToast) return;
    const { productId: pId, eventId: evtId } = undoToast;
    setDismissedMap((prev) => {
      const copy = { ...prev };
      delete copy[pId];
      return copy;
    });
    setUndoToast(null);
    api.undoDismiss({ productId: pId, eventId: evtId }).catch(() => {});
  }, [undoToast]);

  const rawItems = useMemo(() => (data && data.items) || [], [data]);
  const items = useMemo(() => rawItems.filter((it) => !dismissedMap[it.productId]), [rawItems, dismissedMap]);
  const crossCategoryItems = useMemo(() => {
    const seenPids = new Set(items.map((it) => it.productId));
    return ((data && data.crossCategoryItems) || []).filter((it) => !dismissedMap[it.productId] && !seenPids.has(it.productId));
  }, [data, dismissedMap, items]);

  const handlePrev = useCallback(() => {
    if (items.length <= VISIBLE_COUNT) return;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, [items.length]);

  const handleNext = useCallback(() => {
    if (items.length <= VISIBLE_COUNT) return;
    setCurrentIndex((prev) => Math.min(items.length - VISIBLE_COUNT, prev + 1));
  }, [items.length]);

  // If there are no items and not loading, don't show empty block on store page
  if (status.kind !== 'loading' && items.length === 0) {
    return null;
  }

  // Slice 4 items on desktop
  const desktopItems = items.slice(currentIndex, currentIndex + VISIBLE_COUNT);

  return (
    <div className="reco-block" aria-label={title}>
      {undoToast && (
        <div className="reco-undo-toast" role="status">
          <span>Đã ẩn sản phẩm khỏi gợi ý.</span>
          <button type="button" className="btn-ghost small reco-undo-btn" onClick={handleUndo}>
            Hoàn tác
          </button>
        </div>
      )}

      {/* Clean Header: Short Title and simple navigation buttons */}
      <div className="reco-block__header">
        <h2 className="reco-block__title">{title}</h2>

        {items.length > VISIBLE_COUNT && (
          <div className="reco-carousel-nav" role="toolbar" aria-label="Điều hướng gợi ý">
            <button
              type="button"
              className="reco-nav-btn"
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              aria-label="Xem sản phẩm trước"
            >
              ‹
            </button>
            <button
              type="button"
              className="reco-nav-btn"
              onClick={handleNext}
              disabled={currentIndex >= items.length - VISIBLE_COUNT}
              aria-label="Xem sản phẩm kế tiếp"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {status.kind === 'loading' && !data && (
        <div className="reco-loading" role="status">
          <div className="spinner small" aria-hidden="true" />
          <p className="muted small">Đang tải gợi ý…</p>
        </div>
      )}

      {/* Grid on Desktop (4 columns) & Horizontal Scroll-Snap on Mobile */}
      {items.length > 0 && (
        <div className="reco-track-wrapper">
          <div className="reco-cards-track">
            {desktopItems.map((it, idx) => (
              <div key={it.productId} className="reco-card-item">
                <ProductCard
                  item={it}
                  position={currentIndex + idx + 1}
                  feedId="home_feed"
                  onSelectProduct={onSelectProduct}
                  onDismiss={handleDismiss}
                  showMenu={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-Category Add-on Block: "Có thể bạn cũng cần" (controlled by showCrossCategory prop) */}
      {showCrossCategory && crossCategoryItems.length > 0 && (
        <div className="reco-sub-section" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #dce5df' }}>
          <div className="reco-block__header" style={{ marginBottom: '12px', border: 'none', padding: 0 }}>
            <h3 className="reco-block__title" style={{ fontSize: '1.125rem' }}>Có thể bạn cũng cần</h3>
          </div>
          <div className="reco-track-wrapper">
            <div className="reco-cards-track">
              {crossCategoryItems.slice(0, VISIBLE_COUNT).map((it, idx) => (
                <div key={it.productId} className="reco-card-item">
                  <ProductCard
                    item={it}
                    position={idx + 1}
                    feedId="home_crosscat"
                    onSelectProduct={onSelectProduct}
                    onDismiss={handleDismiss}
                    showMenu={true}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
