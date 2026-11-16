import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import ProductCard from './ProductCard.jsx';
import { createRecommendationController } from '../utils/recommendationController.js';
import { newEventId, getVisitId } from '../utils/eventId.js';
import '../styles/Recommendations.css';

const VISIBLE_COUNT = 4;

const ALGORITHM_DEFINITIONS = [
  {
    id: 'hybrid',
    label: 'Mô hình lai Hybrid (7 tầng)',
    shortLabel: 'Hybrid 7 tầng',
    badge: 'Hybrid Engine (7 tầng)',
    tagline: 'Tổng hợp 7 tầng: Ý định NLP (<5ms) + Lọc cộng tác + Đa hành vi + Phân rã thời gian + Serendipity',
    formula: 'Score = ∑ (wi · Score_i) × 2^(-Δt / λ) - Penalty',
    cypher: `// 1. Lọc cộng tác đồ thị (User-CF, trọng số w = 2.5):
MATCH (me:Customer { customerId: $customerId, role: 'customer' })-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(other:Customer)-[:BOUGHT]->(cand:Product)
WHERE other <> me AND NOT (me)-[:BOUGHT]->(cand)
WITH cand, count(DISTINCT other) * 2.5 AS score_cf

// 2. Đa hành vi (Multi-behavior: Mua x3.0 + Xem x1.0, trọng số w = 2.0):
MATCH (me)-[r1]->(p1)<-[r2]-(peer)-[r3]->(cand)
WHERE (type(r3) = 'BOUGHT' OR type(r3) = 'VIEWED') AND NOT (me)-[:BOUGHT]->(cand)
WITH cand, score_cf, (count(CASE WHEN type(r3)='BOUGHT' THEN 1 END)*3.0 + count(CASE WHEN type(r3)='VIEWED' THEN 1 END)*1.0) * 2.0 AS score_multi

// 3. Phân rã thời gian theo hàm mũ (Time-decay) & Xếp hạng Top-K:
RETURN cand.productId AS productId, cand.name AS name, cand.price AS price,
       (score_cf + score_multi) * 2^(-cand.ageDays / 14.0) AS score
ORDER BY score DESC LIMIT $limit`,
    description: 'Động cơ gợi ý lai kết hợp đồng thời lịch sử mua, lịch sử xem, ý định tìm kiếm tiếng Việt bóc tách ngân sách và phân rã thời gian theo hàm mũ để xếp hạng ứng viên tối ưu.',
  },
  {
    id: 'user_cf',
    label: 'Lọc cộng tác (User-CF)',
    shortLabel: 'User-based CF',
    badge: 'Lọc cộng tác User-CF',
    tagline: 'Lọc cộng tác dựa trên khách hàng có cùng lịch sử mua sắm',
    formula: 'Support(u, p) = |{ v ∈ N(u) | v đã mua p }|',
    cypher: `MATCH (me:Customer { customerId: $customerId, role: 'customer' })-[:BOUGHT]->(p1:Product)
MATCH (other:Customer { role: 'customer' })-[:BOUGHT]->(p1)
WHERE other <> me
MATCH (other)-[:BOUGHT]->(rec:Product)
WHERE rec.active = true AND NOT (me)-[:BOUGHT]->(rec)
WITH rec, count(DISTINCT other) AS support, sum(1.0) AS score
RETURN rec.productId AS productId, rec.name AS name, rec.price AS price,
       rec.imageUrl AS imageUrl, score, support
ORDER BY score DESC, support DESC
LIMIT $limit`,
    description: 'Duyệt đồ thị 2 bước nhảy (2 hops): Tìm những khách hàng có chung sản phẩm đã mua với bạn, sau đó gợi ý các sản phẩm họ đã mua mà bạn chưa có.',
  },
  {
    id: 'weighted',
    label: 'Đa hành vi (Mua x3.0 + Xem x1.0)',
    shortLabel: 'Đa hành vi (Trọng số)',
    badge: 'Đa hành vi (Mua x3 + Xem x1)',
    tagline: 'Lọc cộng tác mở rộng kết hợp trọng số Mua và Xem',
    formula: 'Score = 3.0 × BoughtCount + 1.0 × ViewedCount',
    cypher: `MATCH (c1:Customer { customerId: $customerId, role: 'customer' })-[r1]->(p1:Product)
WHERE (type(r1) = 'BOUGHT' OR type(r1) = 'VIEWED')
MATCH (c2:Customer { role: 'customer' })-[r2]->(p1)
WHERE c2 <> c1 AND (type(r2) = 'BOUGHT' OR type(r2) = 'VIEWED')
MATCH (c2)-[r3]->(rec:Product)
WHERE (type(r3) = 'BOUGHT' OR type(r3) = 'VIEWED')
  AND rec.active = true AND NOT (c1)-[:BOUGHT]->(rec)
WITH rec, count(DISTINCT c2) AS support,
     count(CASE WHEN type(r3) = 'BOUGHT' THEN 1 END) AS boughtCount,
     count(CASE WHEN type(r3) = 'VIEWED' THEN 1 END) AS viewedCount
RETURN rec.productId AS productId, rec.name AS name, rec.price AS price,
       (boughtCount * 3.0 + viewedCount * 1.0) AS score, support
ORDER BY score DESC, support DESC
LIMIT $limit`,
    description: 'Gán trọng số đa hành vi: Mỗi lượt Mua được tính 3.0 điểm, mỗi lượt Xem tính 1.0 điểm từ những khách hàng có tương tác tương đồng trên đồ thị.',
  },
  {
    id: 'cross_category',
    label: 'Khám phá chéo (Serendipity)',
    shortLabel: 'Chéo Serendipity',
    badge: 'Khám phá chéo (Serendipity)',
    tagline: 'Gợi ý đột phá chéo danh mục: "Bán cần câu -> Bán thuyền"',
    formula: 'Category(rec) ≠ Category(anchor)  ∧  CoBuyerCount ≥ 1',
    cypher: `MATCH (me:Customer { customerId: $customerId })-[:BOUGHT]->(p1:Product)-[:BELONGS_TO]->(c1:Category)
MATCH (peer:Customer)-[:BOUGHT]->(p1) WHERE peer <> me
MATCH (peer)-[:BOUGHT]->(p2:Product)-[:BELONGS_TO]->(c2:Category)
WHERE p2.active = true AND c2 <> c1 AND NOT (me)-[:BOUGHT]->(p2)
WITH p2, c2, c1, count(DISTINCT peer) AS coBuyerCount
ORDER BY coBuyerCount DESC, p2.rating DESC
RETURN p2.productId AS productId, p2.name AS name, p2.price AS price,
       c2.name AS categoryName, coBuyerCount AS support
LIMIT $limit`,
    description: 'Phá vỡ bẫy "Bong bóng thông tin" (Filter Bubble). Khi khách mua Laptop, hệ thống phân tích giỏ hàng mua kèm để gợi ý Bàn phím hoặc Phụ kiện chéo danh mục.',
  },
  {
    id: 'trending',
    label: 'Thịnh hành (Cold-Start)',
    shortLabel: 'Thịnh hành Trending',
    badge: 'Thịnh hành (Cold-Start)',
    tagline: 'Sản phẩm phổ biến và đánh giá cao (Giải pháp Cold-Start)',
    formula: 'Score = Count(Distinct Buyers) × Rating',
    cypher: `MATCH (c:Customer { role: 'customer', active: true })-[r:BOUGHT]->(p:Product)
WHERE p.active = true
WITH p, count(DISTINCT c) AS buyers, count(r) AS orderCount
RETURN p.productId AS productId, p.name AS name, p.price AS price,
       buyers AS support, buyers AS score
ORDER BY buyers DESC, p.rating DESC, p.productId ASC
LIMIT $limit`,
    description: 'Giải pháp cho bài toán khởi đầu lạnh (Cold-Start Problem) khi người dùng mới chưa có bất kỳ dữ liệu lịch sử nào trên hệ thống đồ thị.',
  },
];

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
  showAlgorithmFilter = true,
}) {
  const [selectedAlgo, setSelectedAlgo] = useState('hybrid');
  const [expandedAlgoId, setExpandedAlgoId] = useState(null);
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissedMap, setDismissedMap] = useState({});
  const [undoToast, setUndoToast] = useState(null);
  const activeCustomerRef = useRef(customerId);

  useEffect(() => {
    activeCustomerRef.current = customerId;
  }, [customerId]);

  const currentAlgoDef = useMemo(() => {
    return ALGORITHM_DEFINITIONS.find((a) => a.id === selectedAlgo) || ALGORITHM_DEFINITIONS[0];
  }, [selectedAlgo]);

  const expandedAlgoDef = useMemo(() => {
    if (!expandedAlgoId) return null;
    return ALGORITHM_DEFINITIONS.find((a) => a.id === expandedAlgoId) || null;
  }, [expandedAlgoId]);

  const handleCopyCypher = useCallback((code) => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedQuery(true);
      setTimeout(() => setCopiedQuery(false), 2000);
    }).catch(() => {});
  }, []);

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
      fetchFn: async (params, opts) => {
        const cId = activeCustomerRef.current;
        const algo = params.algorithm || 'hybrid';

        if (algo === 'user_cf') {
          return api.recommendForMe({
            limit: params.limit,
            demoCustomerId: cId || 'RC_C001',
            excludeProductId: params.excludeProductId,
          }, opts);
        }

        if (algo === 'weighted') {
          return api.recommendForMe({
            limit: params.limit,
            formula: 'weighted',
            demoCustomerId: cId || 'RC_C001',
            excludeProductId: params.excludeProductId,
          }, opts);
        }

        if (algo === 'cross_category') {
          return api.getCrossCategory({
            limit: params.limit,
            demoCustomerId: cId || 'RC_C001',
          }, opts);
        }

        if (algo === 'trending') {
          return api.getTrending({
            limit: params.limit,
          }, opts);
        }

        // Default: hybrid
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
      algorithm: selectedAlgo,
      limit: Math.max(8, maxItems),
      pageSize: Math.max(8, maxItems),
    };
    const effectiveExcludeId = excludeProductId || (mode === 'product' ? productId : null);
    if (effectiveExcludeId) {
      params.excludeProductId = effectiveExcludeId;
    }
    await controllerRef.current.fetch(params);
  }, [selectedAlgo, maxItems, excludeProductId, mode, productId]);

  useEffect(() => {
    setData(null);
    fetchData();
    return () => {
      controllerRef.current?.abort();
    };
  }, [fetchData, refreshKey, customerId, selectedAlgo]);

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

  // Sliced items for carousel
  const desktopItems = items.slice(currentIndex, currentIndex + VISIBLE_COUNT);

  // Helper badge text for each item based on current algorithm
  const getItemBadge = (it) => {
    if (selectedAlgo === 'weighted') {
      const b = it.boughtCount ?? 0;
      const v = it.viewedCount ?? 0;
      return `${b} mua + ${v} xem (${it.score || 0}đ)`;
    }
    if (selectedAlgo === 'user_cf') {
      const sup = it.support ?? 1;
      return `${sup} người cùng mua (${it.score || sup}đ)`;
    }
    if (selectedAlgo === 'cross_category') {
      return `Mua kèm chéo (${it.categoryName || 'Phụ kiện'})`;
    }
    if (selectedAlgo === 'trending') {
      return `${it.support || 9} khách đã mua`;
    }
    // Hybrid
    if (it.isSerendipity) return 'Serendipity';
    if (it.source === 'user_cf') return 'User-CF';
    if (it.source === 'multibehavior') return 'Đa hành vi';
    if (it.source === 'search') return 'Ý định tìm kiếm';
    return `Hybrid (${Math.round((it.score || 0.8) * 100) / 100})`;
  };

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

      {/* 1. Header with Title & Carousel Nav */}
      <div className="reco-block__header">
        <div className="reco-block__header-left">
          <h2 className="reco-block__title">{title}</h2>
          <span className="reco-algo-pill">{currentAlgoDef.badge}</span>
        </div>

        {items.length > VISIBLE_COUNT && (
          <div className="reco-carousel-nav" role="toolbar" aria-label="Điều hướng gợi ý">
            <span className="reco-page-indicator muted small">
              {currentIndex + 1} - {Math.min(currentIndex + VISIBLE_COUNT, items.length)} / {items.length}
            </span>
            <button
              type="button"
              className="reco-nav-btn"
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              aria-label="Xem sản phẩm trước"
              title="Xem sản phẩm trước"
            >
              ‹
            </button>
            <button
              type="button"
              className="reco-nav-btn"
              onClick={handleNext}
              disabled={currentIndex >= items.length - VISIBLE_COUNT}
              aria-label="Xem sản phẩm kế tiếp"
              title="Xem sản phẩm kế tiếp"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* 2. ALGORITHM FILTER BUTTONS WITH INDIVIDUAL DROPDOWNS & QUICK SELECT */}
      {showAlgorithmFilter && (
        <div className="reco-algo-selector" role="tablist" aria-label="Chọn thuật toán gợi ý">
          <div className="reco-algo-header-row">
            <div className="reco-algo-tabs">
              {ALGORITHM_DEFINITIONS.map((algo) => {
                const isActive = selectedAlgo === algo.id;
                const isExpanded = expandedAlgoId === algo.id;
                return (
                  <div
                    key={algo.id}
                    className={`reco-algo-btn-group ${isActive ? 'reco-algo-btn-group--active' : ''}`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`reco-algo-btn ${isActive ? 'reco-algo-btn--active' : ''}`}
                      onClick={() => {
                        setSelectedAlgo(algo.id);
                        setCurrentIndex(0);
                      }}
                      title={algo.tagline}
                    >
                      <span className="reco-algo-btn__label">{algo.shortLabel}</span>
                      {isActive && <span className="reco-algo-btn__dot" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className={`reco-algo-dropdown-btn ${isExpanded ? 'reco-algo-dropdown-btn--active' : ''}`}
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedAlgoId(null);
                        } else {
                          setExpandedAlgoId(algo.id);
                          setSelectedAlgo(algo.id);
                          setCurrentIndex(0);
                        }
                      }}
                      title={`Xem chi tiết mô hình & câu lệnh Cypher của ${algo.shortLabel}`}
                      aria-label={`Xem chi tiết mô hình & câu lệnh Cypher của ${algo.shortLabel}`}
                    >
                      <span style={{ fontSize: '0.6875rem' }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. ALGORITHM EXPLANATION CARD (CHỈ HIỂN THỊ KHI NGƯỜI DÙNG BẤM DROPDOWN) */}
      {showAlgorithmFilter && expandedAlgoDef && (
        <div className="reco-explainer-card">
          <div className="reco-explainer-card__top">
            <div className="reco-explainer-card__info">
              <div className="reco-explainer-card__title">
                <strong>{expandedAlgoDef.label}</strong>
                <span className="reco-formula-badge">{expandedAlgoDef.formula}</span>
              </div>
              <p className="reco-explainer-card__desc">{expandedAlgoDef.description}</p>
            </div>

            <button
              type="button"
              className="reco-explainer-close-btn"
              onClick={() => setExpandedAlgoId(null)}
              title="Thu gọn khung giải thích"
            >
              ▲ Thu gọn
            </button>
          </div>

          <div className="reco-explainer-card__meta">
            <span className="reco-meta-tag">
              Đối tượng phân tích:{' '}
              {customerId ? (
                <strong>Tài khoản hiện tại ({customerId})</strong>
              ) : (
                <strong>Mô phỏng đồ thị: Nguyễn Minh An (RC_C001)</strong>
              )}
            </span>
            <span className="reco-meta-tag">
              Tổng ứng viên lọc: <strong>{items.length} sản phẩm</strong>
            </span>
          </div>

          {/* Câu lệnh truy vấn Cypher thực tế trên Neo4j */}
          {expandedAlgoDef.cypher && (
            <div className="reco-cypher-box">
              <div className="reco-cypher-header">
                <span>Câu lệnh truy vấn Cypher thực thi trên CSDL đồ thị Neo4j:</span>
                <button
                  type="button"
                  className="reco-cypher-copy-btn"
                  onClick={() => handleCopyCypher(expandedAlgoDef.cypher)}
                >
                  {copiedQuery ? 'Đã sao chép ✓' : 'Sao chép câu lệnh'}
                </button>
              </div>
              <pre className="reco-cypher-pre">
                <code className="reco-cypher-code">{expandedAlgoDef.cypher}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 4. Loading state */}
      {status.kind === 'loading' && !data && (
        <div className="reco-loading" role="status">
          <div className="spinner small" aria-hidden="true" />
          <p className="muted small">Đang thực thi thuật toán trên đồ thị Neo4j…</p>
        </div>
      )}

      {/* 5. Empty state */}
      {status.kind !== 'loading' && items.length === 0 && (
        <div className="reco-empty-notice">
          <p>Chưa tìm thấy ứng viên phù hợp cho thuật toán này với bộ dữ liệu hiện tại.</p>
        </div>
      )}

      {/* 6. Product Cards Grid */}
      {items.length > 0 && (
        <div className="reco-track-wrapper">
          <div className="reco-cards-track">
            {desktopItems.map((it, idx) => (
              <div key={it.productId} className="reco-card-item">
                {/* Algorithm reason banner directly above card */}
                <div className="reco-item-algo-banner" title={it.reason || currentAlgoDef.tagline}>
                  <span className="reco-item-algo-text">{getItemBadge(it)}</span>
                </div>
                <ProductCard
                  item={it}
                  position={currentIndex + idx + 1}
                  feedId={`algo_${selectedAlgo}`}
                  onSelectProduct={onSelectProduct}
                  onDismiss={handleDismiss}
                  showMenu={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Cross-Category Add-on Block (if enabled for hybrid) */}
      {showCrossCategory && selectedAlgo === 'hybrid' && crossCategoryItems.length > 0 && (
        <div className="reco-sub-section" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #dce5df' }}>
          <div className="reco-block__header" style={{ marginBottom: '12px', border: 'none', padding: 0 }}>
            <h3 className="reco-block__title" style={{ fontSize: '1.125rem' }}>
              Khám phá chéo danh mục (Serendipity)
            </h3>
          </div>
          <div className="reco-track-wrapper">
            <div className="reco-cards-track">
              {crossCategoryItems.slice(0, VISIBLE_COUNT).map((it, idx) => (
                <div key={it.productId} className="reco-card-item">
                  <div className="reco-item-algo-banner">
                    <span className="reco-item-algo-text">Mua kèm chéo danh mục</span>
                  </div>
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
