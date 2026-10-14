import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, formatRecommendationReason } from '../utils/format.js';
import { getProductPlaceholderSvg, getProductImageUrl } from '../utils/imageFallback.js';
import '../styles/Recommendations.css';

const HEADINGS = {
  me: 'Gợi ý thông minh dành cho bạn',
  product: 'Sản phẩm thường được mua cùng',
};

function RecoCardImage({ src, alt, category, productId }) {
  const [errored, setErrored] = useState(false);
  const resolvedUrl = useMemo(() => getProductImageUrl(productId, src), [productId, src]);
  const fallback = useMemo(() => getProductPlaceholderSvg(category || alt, 400, 300), [category, alt]);

  if (errored || !resolvedUrl) {
    return (
      <img
        className="product-card__image"
        src={fallback}
        alt={alt || 'Sản phẩm gợi ý'}
        loading="lazy"
        decoding="async"
        width="400"
        height="300"
      />
    );
  }

  return (
    <img
      className="product-card__image"
      src={resolvedUrl}
      alt={alt || 'Sản phẩm gợi ý'}
      loading="lazy"
      decoding="async"
      width="400"
      height="300"
      onError={() => setErrored(true)}
    />
  );
}

const VISIBLE_COUNT = 4;

export default function Recommendations({
  mode = 'me',
  productId = null,
  onSelectProduct,
  title,
  refreshKey = 0,
  maxItems = 12,
}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [formula, setFormula] = useState('default'); // 'default' | 'weighted'
  const [showCypher, setShowCypher] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const requestSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const mySeq = ++requestSeq.current;
    setStatus({ kind: 'loading', error: null });
    try {
      // Fetch up to 12 items to allow rich horizontal infinite carousel rotation
      const params = { limit: Math.max(12, maxItems) };
      if (formula === 'weighted') {
        params.formula = 'weighted';
      }
      const res = mode === 'product'
        ? await api.recommendForProduct(productId, params)
        : await api.recommendForMe(params);
      if (mySeq !== requestSeq.current) return;
      setData(res);
      setCurrentIndex(0);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (mySeq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message });
      setData(null);
    }
  }, [mode, productId, maxItems, formula]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const headingText = title || HEADINGS[mode] || 'Sản phẩm gợi ý';
  const items = useMemo(() => (data && data.items) || [], [data]);
  const rawReason = (data && data.reason) || '';
  const reasonText = useMemo(() => formatRecommendationReason(rawReason, mode), [rawReason, mode]);

  // Infinite Loop Navigation Handlers
  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  // Compute 4 circular visible items for viewport
  const visibleItems = useMemo(() => {
    if (items.length === 0) return [];
    if (items.length <= VISIBLE_COUNT) return items;
    const result = [];
    for (let i = 0; i < VISIBLE_COUNT; i++) {
      result.push(items[(currentIndex + i) % items.length]);
    }
    return result;
  }, [items, currentIndex]);

  // Cypher queries for SV2 evaluation
  const cypherQuery = mode === 'me'
    ? (formula === 'weighted'
      ? `// Gợi ý cá nhân hoá đa hành vi: BOUGHT (x3.0) + VIEWED (x1.0)
MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
MATCH (c1)-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)
WHERE c2 <> c1 AND c2.role = 'customer' AND c2.active = true
WITH c1, c2, count(DISTINCT p1) AS sharedCount
MATCH (c2)-[r]->(p2:Product)
WHERE (type(r) = 'BOUGHT' OR type(r) = 'VIEWED')
  AND p2.active = true AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(p2) }
WITH p2, c2, sharedCount,
     count(DISTINCT CASE WHEN type(r) = 'BOUGHT' THEN c2 END) AS peerBought,
     count(CASE WHEN type(r) = 'VIEWED' THEN 1 END) AS peerViews
WITH p2, sum(peerBought) AS boughtCount, sum(peerViews) AS viewedCount,
     count(DISTINCT CASE WHEN peerBought > 0 OR peerViews > 0 THEN c2 END) AS support,
     sum(peerBought * 3.0 + peerViews * 1.0) AS score
WHERE score > 0
RETURN p2.productId, p2.name, p2.price, round(score * 10) / 10 AS score, support, boughtCount, viewedCount
ORDER BY score DESC, support DESC, productId ASC LIMIT $limit`
      : `// Gợi ý cá nhân hoá chuẩn lọc cộng tác (User-based Collaborative Filtering)
MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
MATCH (c1)-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)
WHERE c2 <> c1 AND c2.role = 'customer' AND c2.active = true
WITH c1, c2, count(DISTINCT p1) AS sharedCount
MATCH (c2)-[:BOUGHT]->(p2:Product)
WHERE p2.active = true AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(p2) }
WITH DISTINCT p2, c2, sharedCount
WITH p2, sum(sharedCount) AS score, count(DISTINCT c2) AS support
RETURN p2.productId, p2.name, p2.price, score, support
ORDER BY score DESC, support DESC, productId ASC LIMIT $limit`)
    : (formula === 'weighted'
      ? `// Gợi ý mua cùng đa hành vi: BOUGHT (x3.0) + VIEWED (x1.0)
MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
MATCH (source:Product { productId: $productId, active: true })
MATCH (source)<-[:BOUGHT]-(buyer:Customer)
WHERE buyer <> c1 AND buyer.role = 'customer' AND buyer.active = true
MATCH (buyer)-[r]->(candidate:Product)
WHERE (type(r) = 'BOUGHT' OR type(r) = 'VIEWED')
  AND candidate <> source AND candidate.active = true
  AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(candidate) }
WITH candidate, buyer,
     count(DISTINCT CASE WHEN type(r) = 'BOUGHT' THEN buyer END) AS buyerBought,
     count(CASE WHEN type(r) = 'VIEWED' THEN 1 END) AS buyerViews
WITH candidate, sum(buyerBought) AS boughtCount, sum(buyerViews) AS viewedCount,
     count(DISTINCT CASE WHEN buyerBought > 0 OR buyerViews > 0 THEN buyer END) AS support,
     sum(buyerBought * 3.0 + buyerViews * 1.0) AS score
WHERE score > 0
RETURN candidate.productId, candidate.name, candidate.price, round(score * 10) / 10 AS score, support, boughtCount, viewedCount
ORDER BY score DESC, support DESC, productId ASC LIMIT $limit`
      : `// Gợi ý mua cùng sản phẩm (Item Co-occurrence / Co-bought)
MATCH (c1:Customer { customerId: $customerId, role: 'customer', active: true })
MATCH (source:Product { productId: $productId, active: true })
MATCH (source)<-[:BOUGHT]-(buyer:Customer)-[:BOUGHT]->(candidate:Product)
WHERE buyer <> c1 AND buyer.role = 'customer' AND buyer.active = true
  AND candidate <> source AND candidate.active = true
  AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(candidate) }
WITH candidate, count(DISTINCT buyer) AS support
RETURN candidate.productId, candidate.name, candidate.price, support AS score, support
ORDER BY score DESC, support DESC, productId ASC LIMIT $limit`);

  return (
    <div className="reco-block" aria-label={headingText}>
      {/* Header with Title and Modern Controls */}
      <div className="reco-block__header">
        <div className="reco-block__title-wrap">
          <span className="reco-block__icon" aria-hidden="true">✨</span>
          <h2 className="reco-block__title">{headingText}</h2>
          <span className="reco-block__neo4j-tag">Neo4j Graph Engine</span>
        </div>

        <div className="reco-block__controls">
          {/* Segmented Pill Control */}
          <div className="reco-segmented" role="group" aria-label="Chế độ tính toán">
            <button
              type="button"
              className={`reco-segmented__btn${formula === 'default' ? ' reco-segmented__btn--active' : ''}`}
              onClick={() => setFormula('default')}
            >
              Chuẩn CF (Chỉ Mua)
            </button>
            <button
              type="button"
              className={`reco-segmented__btn${formula === 'weighted' ? ' reco-segmented__btn--active' : ''}`}
              onClick={() => setFormula('weighted')}
            >
              Đa hành vi (Mua x3 + Xem x1)
            </button>
          </div>

          {/* Inspector Drawer Toggle */}
          <button
            type="button"
            className={`reco-inspector-toggle${showCypher ? ' reco-inspector-toggle--active' : ''}`}
            onClick={() => setShowCypher((v) => !v)}
            aria-expanded={showCypher}
          >
            <span aria-hidden="true">{showCypher ? '✕' : '</>'}</span>
            <span>{showCypher ? 'Đóng Cypher' : 'Xem Cypher & Công thức'}</span>
          </button>

          {/* 2 Nút điều hướng mũi tên trái và phải xoay vòng vô tận */}
          {items.length > 1 && (
            <div className="reco-carousel-nav" role="toolbar" aria-label="Điều hướng gợi ý xoay vòng">
              <button
                type="button"
                className="reco-carousel-nav__btn"
                onClick={handlePrev}
                aria-label="Gợi ý trước (xoay vòng)"
                title="Gợi ý trước"
              >
                ‹
              </button>
              <span className="reco-carousel-nav__counter">
                {items.length > VISIBLE_COUNT ? `${(currentIndex % items.length) + 1}/${items.length}` : `${items.length}`}
              </span>
              <button
                type="button"
                className="reco-carousel-nav__btn"
                onClick={handleNext}
                aria-label="Gợi ý tiếp theo (xoay vòng vô tận)"
                title="Gợi ý tiếp theo"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Developer Inspector Panel (SV2 Showcase) */}
      {showCypher && (
        <div className="reco-developer-panel" role="region" aria-label="Khung kỹ thuật Cypher và Công thức">
          <div className="reco-developer-panel__top">
            <div className="reco-developer-panel__badge">
              <span className="dot" aria-hidden="true" />
              <span>Cypher Pipeline: {formula === 'weighted' ? 'Weighted Multi-Behavior' : 'Standard Collaborative Filtering'}</span>
            </div>
            <span className="reco-developer-panel__hint">Khảo sát trực tiếp đồ thị Neo4j</span>
          </div>

          <pre className="reco-developer-panel__code">
            <code>{cypherQuery}</code>
          </pre>

          <div className="reco-developer-panel__cards">
            <div className="reco-feature-card">
              <div className="reco-feature-card__num">01</div>
              <div className="reco-feature-card__content">
                <strong>Mẫu hình đường đi (Graph Pattern):</strong>
                <p>
                  {mode === 'me'
                    ? '(c1)-[:BOUGHT]->(p1)<-[:BOUGHT]-(c2)-[:BOUGHT|VIEWED]->(p2)'
                    : '(source)<-[:BOUGHT]-(buyer)-[:BOUGHT|VIEWED]->(candidate)'}
                </p>
              </div>
            </div>

            <div className="reco-feature-card">
              <div className="reco-feature-card__num">02</div>
              <div className="reco-feature-card__content">
                <strong>Điều kiện loại trừ (Filtering):</strong>
                <p>
                  <code>NOT EXISTS &#123; MATCH (c1)-[:BOUGHT]-&gt;(p) &#125;</code> loại bỏ sản phẩm đã mua; <code>p.active = true</code> lọc sản phẩm còn kinh doanh.
                </p>
              </div>
            </div>

            <div className="reco-feature-card">
              <div className="reco-feature-card__num">03</div>
              <div className="reco-feature-card__content">
                <strong>Công thức tính điểm (Scoring):</strong>
                <p>
                  {formula === 'weighted'
                    ? 'Score = 3.0 * BOUGHT + 1.0 * VIEWED (Hành vi Mua có trọng số gấp 3 lần hành vi Xem).'
                    : 'Score = Tổng số sản phẩm mua chung (sharedCount) của các khách hàng tương đồng.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reason Box with Proper Accented Vietnamese */}
      {reasonText && (
        <div className="reco-reason-box">
          <span className="reco-reason-box__icon" aria-hidden="true">💡</span>
          <span className="reco-reason-box__text">{reasonText}</span>
        </div>
      )}

      {/* Loading & Error States */}
      {status.kind === 'loading' && !data && (
        <div className="reco-loading">
          <div className="spinner small" aria-hidden="true" />
          <p className="muted small">Đang phân tích đồ thị Neo4j để đưa ra gợi ý…</p>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="error-text">
          <p>Không tải được dữ liệu gợi ý.</p>
          <button type="button" className="btn-ghost small" onClick={fetchData}>Tải lại</button>
        </div>
      )}

      {status.kind !== 'loading' && items.length === 0 && (
        <div className="reco-empty-card">
          <p className="muted">
            {mode === 'me'
              ? 'Tài khoản chưa có lịch sử mua hàng. Hãy khám phá và mua sắm để nhận được các gợi ý tương thích nhất.'
              : 'Chưa có dữ liệu đồng mua cho sản phẩm này.'}
          </p>
        </div>
      )}

      {/* Horizontal Carousel Viewport (Tối đa 4 sản phẩm / Viewport Desktop xoay vòng vô tận) */}
      {visibleItems.length > 0 && (
        <div className="reco-carousel-container">
          <div className="reco-carousel-viewport">
            <div className={`reco-carousel-track reco-carousel-track--count-${visibleItems.length}`}>
              {visibleItems.map((it, idx) => (
                <article key={`${it.productId}-${idx}`} className="product-card reco-card reco-carousel-item">
                  <div className="product-card__image-wrap">
                    <RecoCardImage
                      src={it.imageUrl}
                      alt={it.name}
                      category={it.categoryId || it.name}
                      productId={it.productId}
                    />
                    <span className="product-card__sku-badge">{it.productId}</span>
                    <div className="product-card__score-badge">
                      <span className="score-val">Điểm: {it.score}</span>
                      <span className="support-val">• {it.support} người cùng mua</span>
                    </div>
                  </div>

                  <div className="product-card__body">
                    <h3 className="product-card__name" title={it.name}>
                      {it.name}
                    </h3>

                    {formula === 'weighted' && it.boughtCount !== undefined && (
                      <div className="reco-card__detail-stats small muted">
                        <span>Mua: <strong>{it.boughtCount}</strong></span>
                        <span>•</span>
                        <span>Xem: <strong>{it.viewedCount || 0}</strong></span>
                      </div>
                    )}

                    <div className="product-card__price">
                      {formatVnd(it.price)} <span className="currency">₫</span>
                    </div>

                    <div className="product-card__actions">
                      <button
                        type="button"
                        className="btn-primary product-card__btn"
                        onClick={() => onSelectProduct && onSelectProduct(it.productId)}
                        aria-label={`Xem chi tiết sản phẩm ${it.name}`}
                      >
                        Xem chi tiết
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
