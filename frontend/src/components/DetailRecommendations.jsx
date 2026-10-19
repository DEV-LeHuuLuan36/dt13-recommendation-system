import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import ProductCard from './ProductCard.jsx';
import { newEventId } from '../utils/eventId.js';
import '../styles/Recommendations.css';

const VISIBLE_COUNT = 4;

export default function DetailRecommendations({
  productId,
  onSelectProduct,
  refreshKey = 0,
}) {
  const [data, setData] = useState(null);
  const [dismissedMap, setDismissedMap] = useState({});
  const [undoToast, setUndoToast] = useState(null);

  const fetchData = useCallback(async () => {
    if (!productId) return;
    try {
      const res = await api.getDetailRecommendations({ productId, limit: 6 });
      setData(res);
    } catch {
      setData(null);
    }
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleDismiss = useCallback((pId) => {
    setDismissedMap((prev) => ({ ...prev, [pId]: true }));
    const evtId = newEventId('dsm');
    api.dismissRecommendation({ eventId: evtId, productId: pId, feedId: 'detail_feed' }).catch(() => {});
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

  const coBought = useMemo(() => {
    return ((data && data.coBought) || []).filter((it) => !dismissedMap[it.productId]);
  }, [data, dismissedMap]);

  const substitutes = useMemo(() => {
    return ((data && data.substitutes) || []).filter((it) => !dismissedMap[it.productId]);
  }, [data, dismissedMap]);

  const crossCategory = useMemo(() => {
    return ((data && data.crossCategory) || []).filter((it) => !dismissedMap[it.productId]);
  }, [data, dismissedMap]);

  if (!data) return null;

  const hasAny = coBought.length > 0 || substitutes.length > 0 || crossCategory.length > 0;
  if (!hasAny) return null;

  return (
    <div className="detail-recommendations-wrapper" style={{ marginTop: '32px' }}>
      {undoToast && (
        <div className="reco-undo-toast" role="status">
          <span>Đã ẩn sản phẩm khỏi gợi ý.</span>
          <button type="button" className="btn-ghost small reco-undo-btn" onClick={handleUndo}>
            Hoàn tác
          </button>
        </div>
      )}

      {/* 1. Khách mua sản phẩm này cũng chọn */}
      {coBought.length > 0 && (
        <div className="reco-block" aria-label="Khách mua sản phẩm này cũng chọn" style={{ marginBottom: '28px' }}>
          <div className="reco-block__header">
            <h2 className="reco-block__title">Khách mua sản phẩm này cũng chọn</h2>
          </div>
          <div className="reco-track-wrapper">
            <div className="reco-cards-track">
              {coBought.slice(0, VISIBLE_COUNT).map((it, idx) => (
                <div key={it.productId} className="reco-card-item">
                  <ProductCard
                    item={it}
                    position={idx + 1}
                    feedId="detail_cobought"
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

      {/* 2. Lựa chọn tương tự */}
      {substitutes.length > 0 && (
        <div className="reco-block" aria-label="Lựa chọn tương tự" style={{ marginBottom: '28px' }}>
          <div className="reco-block__header">
            <h2 className="reco-block__title">Lựa chọn tương tự</h2>
          </div>
          <div className="reco-track-wrapper">
            <div className="reco-cards-track">
              {substitutes.slice(0, VISIBLE_COUNT).map((it, idx) => (
                <div key={it.productId} className="reco-card-item">
                  <ProductCard
                    item={it}
                    position={idx + 1}
                    feedId="detail_substitutes"
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

      {/* 3. Có thể bạn cũng cần (Cross-Category) */}
      {crossCategory.length > 0 && (
        <div className="reco-block" aria-label="Có thể bạn cũng cần">
          <div className="reco-block__header">
            <h2 className="reco-block__title">Có thể bạn cũng cần</h2>
          </div>
          <div className="reco-track-wrapper">
            <div className="reco-cards-track">
              {crossCategory.slice(0, VISIBLE_COUNT).map((it, idx) => (
                <div key={it.productId} className="reco-card-item">
                  <ProductCard
                    item={it}
                    position={idx + 1}
                    feedId="detail_crosscat"
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
