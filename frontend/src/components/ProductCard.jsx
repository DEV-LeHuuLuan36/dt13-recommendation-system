import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { formatVnd, extractProductSpecs } from '../utils/format.js';
import { getProductPlaceholderSvg, getProductImageUrl } from '../utils/imageFallback.js';
import { newEventId, getVisitId } from '../utils/eventId.js';

/**
 * Formats a grounded, human-friendly explanation sentence without technical leaks.
 */
function getGroundedExplanation(item) {
  const r = (item?.reason || item?.evidence || '').toLowerCase();
  if (r.includes('tim kiem') || r.includes('tìm kiếm') || r.includes('search')) {
    return 'Gợi ý dựa trên sản phẩm bạn đã tìm kiếm gần đây.';
  }
  if (r.includes('cung chon') || r.includes('cũng chọn') || r.includes('co_bought') || r.includes('mua kem') || r.includes('mua kèm')) {
    return 'Những khách đã mua sản phẩm bạn đang xem cũng chọn món này.';
  }
  if (r.includes('mua chung') || r.includes('cf') || r.includes('tuong dong') || r.includes('tương đồng')) {
    return 'Những khách hàng có sở thích tương đồng cũng lựa chọn sản phẩm này.';
  }
  if (r.includes('thay the') || r.includes('thay thế') || r.includes('tuong tu') || r.includes('tương tự') || r.includes('substitute')) {
    return 'Lựa chọn tương tự cùng phân khúc để bạn tiện so sánh.';
  }
  if (r.includes('khac danh muc') || r.includes('khác danh mục') || r.includes('cross_category')) {
    return 'Sản phẩm thuộc nhóm khác thường được mua kèm với nhu cầu hiện tại.';
  }
  if (item?.reason) {
    return 'Gợi ý phù hợp với nhu cầu và mối quan tâm của bạn.';
  }
  return null;
}

export default function ProductCard({
  item,
  onSelectProduct,
  onDismiss = null,
  feedId = null,
  position = 1,
  showMenu = true,
}) {
  const cardRef = useRef(null);
  const impressedRef = useRef(false);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);

  const productId = item.productId;
  const productUrl = `/?view=product&id=${encodeURIComponent(productId)}`;

  const resolvedImgUrl = useMemo(() => getProductImageUrl(productId, item.imageUrl), [productId, item.imageUrl]);
  const fallbackImg = useMemo(() => getProductPlaceholderSvg(item.categoryId || item.name, 400, 400), [item.categoryId, item.name]);

  const specs = useMemo(() => extractProductSpecs(item), [item]);
  const explanation = useMemo(() => getGroundedExplanation(item), [item]);

  // Viewport intersection impression tracking: only records when card is strictly visible >= 50% for 1 second
  useEffect(() => {
    if (!feedId || !cardRef.current || impressedRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const timer = setTimeout(() => {
            if (!impressedRef.current) {
              impressedRef.current = true;
              api.recordImpression({
                eventId: newEventId('imp'),
                feedId,
                visitId: getVisitId(),
                items: [{ productId, position }],
              }).catch(() => {});
            }
          }, 1000);
          return () => clearTimeout(timer);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [feedId, productId, position]);

  // Click outside to close options menu
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const handleCardClick = (e) => {
    if (e) e.preventDefault();
    if (feedId) {
      api.recordRecoClick({
        eventId: newEventId('click'),
        feedId,
        productId,
        position,
      }).catch(() => {});
    }
    if (onSelectProduct) {
      onSelectProduct(productId);
    }
  };

  const hasMenuOptions = (explanation && showMenu) || onDismiss;

  return (
    <article
      ref={cardRef}
      className={`product-card${item.active === false ? ' product-card--inactive' : ''}`}
      aria-label={item.name}
    >
      {/* Three-dots menu button */}
      {hasMenuOptions && (
        <div className="product-card__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="product-card__more-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Tùy chọn cho ${item.name}`}
            title="Tùy chọn"
          >
            •••
          </button>

          {menuOpen && (
            <div className="product-card__menu-dropdown" role="menu">
              {explanation && (
                <button
                  type="button"
                  className="product-card__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowExplanation(true);
                  }}
                >
                  Vì sao có gợi ý này?
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  className="product-card__menu-item product-card__menu-item--dismiss"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDismiss(productId);
                  }}
                >
                  Ẩn sản phẩm này
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Product Image: Square 1:1, object-fit contain, padding ~16px, white background */}
      <div className="product-card__image-wrap">
        <a
          href={productUrl}
          onClick={handleCardClick}
          tabIndex={-1}
          aria-hidden="true"
          className="product-card__image-link"
        >
          <img
            className="product-card__image"
            src={imgErrored || !resolvedImgUrl ? fallbackImg : resolvedImgUrl}
            alt={item.name || 'Sản phẩm'}
            loading="lazy"
            decoding="async"
            width="300"
            height="300"
            onError={() => setImgErrored(true)}
          />
        </a>
      </div>

      {/* Product Content Body */}
      <div className="product-card__body">
        {/* Subtle Brand Text */}
        {item.brand && (
          <span className="product-card__brand" title={`Thương hiệu ${item.brand}`}>
            {item.brand}
          </span>
        )}

        {/* Product Name (Slate, max 2 lines, full name in title for accessibility) */}
        <h3 className="product-card__name" title={item.name}>
          <a href={productUrl} onClick={handleCardClick}>
            {item.name}
          </a>
        </h3>

        {/* Real specs tags if present (max 2) */}
        {specs.length > 0 && (
          <div className="product-card__specs" aria-label="Thông số kỹ thuật">
            {specs.map((sp) => (
              <span key={sp} className="product-card__spec-tag">
                {sp}
              </span>
            ))}
          </div>
        )}

        {/* Price: Bold, vi-VN format, no underline */}
        <div className="product-card__price">
          {formatVnd(item.price)} ₫
        </div>

        {/* Action: Secondary clean button, aligned to bottom */}
        <div className="product-card__actions">
          <a
            href={productUrl}
            className="product-card__btn"
            onClick={handleCardClick}
            aria-label={`Xem chi tiết sản phẩm ${item.name}`}
          >
            Xem sản phẩm
          </a>
        </div>
      </div>

      {/* Accessible Modal / Note for grounded explanation */}
      {showExplanation && (
        <div
          className="product-card__explanation-dialog"
          role="dialog"
          aria-label="Lý do gợi ý"
        >
          <div className="product-card__explanation-box">
            <div className="product-card__explanation-header">
              <strong>Lý do gợi ý</strong>
              <button
                type="button"
                className="product-card__explanation-close"
                onClick={() => setShowExplanation(false)}
                aria-label="Đóng lý do"
              >
                ✕
              </button>
            </div>
            <p className="product-card__explanation-text">{explanation}</p>
          </div>
        </div>
      )}
    </article>
  );
}
