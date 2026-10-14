import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { formatVnd } from '../../utils/format.js';
import { getCategoryIconPaths, getProductImageUrl, RC_IMAGE_FILES } from '../../utils/imageFallback.js';
import '../../styles/AdminCrud.css';

const EMPTY_PRODUCT = {
  productId: '',
  name: '',
  description: '',
  price: 0,
  categoryId: '',
  selectedImage: '',
  active: true,
};

function AdminProductThumb({ productId, src, alt, categoryId }) {
  const [errored, setErrored] = useState(false);
  const resolvedUrl = useMemo(() => {
    return getProductImageUrl(productId, src) || (productId ? `/images/products/${productId.toLowerCase()}.jpg` : null);
  }, [productId, src]);

  if (errored || !resolvedUrl) {
    return (
      <div
        className="admin-product-thumb admin-product-thumb--fallback"
        title={alt || categoryId || productId}
        dangerouslySetInnerHTML={{
          __html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none">${getCategoryIconPaths(categoryId || alt || productId)}</svg>`,
        }}
      />
    );
  }

  return (
    <div className="admin-product-thumb">
      <img
        src={resolvedUrl}
        alt={alt || productId}
        width="48"
        height="48"
        className="admin-product-thumb__img"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

function ImagePickerGrid({ selectedUrl, onSelect, onResetAuto, autoUrl }) {
  const [filterText, setFilterText] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // Filter 120 image catalog
  const filteredImages = useMemo(() => {
    const list = Object.entries(RC_IMAGE_FILES).map(([sku, fn]) => ({
      sku: sku.toUpperCase(),
      fileName: fn,
      url: `/images/products/${fn}`,
    }));
    if (!filterText.trim()) return list;
    const q = filterText.toLowerCase().trim();
    return list.filter((it) => it.sku.toLowerCase().includes(q) || it.fileName.toLowerCase().includes(q));
  }, [filterText]);

  return (
    <div className="admin-image-picker">
      <div className="admin-image-picker__header">
        <div className="admin-image-picker__title-row">
          <span className="admin-image-picker__title">
            🖼️ Bảng chọn ảnh mẫu trực quan ({filteredImages.length} ảnh thực tế)
          </span>
          {onResetAuto && autoUrl && selectedUrl !== autoUrl && (
            <button
              type="button"
              className="btn-ghost small"
              onClick={onResetAuto}
              title="Khôi phục ảnh tự động theo SKU"
            >
              ↺ Tự động theo SKU
            </button>
          )}
        </div>

        <div className="admin-image-picker__toolbar">
          <input
            type="search"
            placeholder="Lọc ảnh theo SKU (ví dụ: P001, 015, 050)..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="admin-image-picker__search"
          />
          <button
            type="button"
            className={`btn-ghost small${showCustom ? ' btn-ghost--active' : ''}`}
            onClick={() => setShowCustom((v) => !v)}
          >
            {showCustom ? 'Ẩn URL ngoài' : '+ Nhập link ảnh tùy ý'}
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="admin-image-picker__custom-row">
          <input
            type="text"
            placeholder="Nhập link ảnh https://... hoặc /images/products/..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="admin-image-picker__custom-input"
          />
          <button
            type="button"
            className="btn-primary small"
            onClick={() => {
              if (customInput.trim()) {
                onSelect(customInput.trim());
              }
            }}
          >
            Áp dụng
          </button>
        </div>
      )}

      {/* Lưới thumbnail ảnh thực tế - Click trực tiếp để chọn */}
      <div className="admin-image-picker__grid">
        {filteredImages.map((img) => {
          const isSelected = selectedUrl === img.url;
          return (
            <button
              key={img.sku}
              type="button"
              className={`admin-image-picker__card${isSelected ? ' admin-image-picker__card--selected' : ''}`}
              onClick={() => onSelect(img.url)}
              title={`Click chọn ảnh: ${img.sku} (${img.fileName})`}
            >
              <img
                src={img.url}
                alt={img.sku}
                loading="lazy"
                width="60"
                height="60"
                className="admin-image-picker__img"
              />
              <span className="admin-image-picker__label">{img.sku}</span>
              {isSelected && <span className="admin-image-picker__check" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="admin-image-picker__hint">
        💡 <strong>Mẹo:</strong> Nhấp trực tiếp vào ảnh thumbnail ở trên để gán ngay cho sản phẩm. Ảnh có viền xanh dương và dấu <strong>✓</strong> là ảnh đang được áp dụng.
      </p>
    </div>
  );
}

function ProductForm({ initial, categories, onCancel, onSubmit, busy, error, title }) {
  const isEdit = Boolean(initial?.productId);
  const [form, setForm] = useState(() => ({
    productId: initial?.productId ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? 0,
    categoryId: initial?.categoryId ?? (categories[0]?.categoryId ?? ''),
    selectedImage: initial?.imageUrl || '',
    active: initial?.active ?? true,
  }));

  const computedImageUrl = useMemo(() => {
    if (form.selectedImage) return form.selectedImage;
    const cleanId = String(form.productId || '').trim().toLowerCase();
    if (cleanId) {
      return getProductImageUrl(cleanId, '') || `/images/products/${cleanId}.jpg`;
    }
    return '';
  }, [form.productId, form.selectedImage]);

  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setPreviewError(false);
  }, [computedImageUrl]);

  const onField = (k) => (e) => {
    const v = k === 'active' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: k === 'price' ? Number(v) : v }));
  };

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        const payload = {
          name: form.name,
          description: form.description,
          price: form.price,
          categoryId: form.categoryId,
          imageUrl: computedImageUrl || (form.productId ? `/images/products/${form.productId.toLowerCase()}.jpg` : null),
          active: form.active,
        };
        if (!isEdit && form.productId) {
          payload.productId = form.productId.trim().toUpperCase();
        }
        onSubmit(payload);
      }}
    >
      <h3>{title}</h3>
      {error && <p className="error-text">{error}</p>}
      
      {!isEdit && (
        <label>
          <span>Mã sản phẩm / SKU (Ví dụ: RC_P121 - hệ thống tự động liên kết ảnh)</span>
          <input
            value={form.productId}
            onChange={onField('productId')}
            placeholder="RC_P..."
            maxLength={30}
          />
        </label>
      )}

      <label>
        <span>Tên sản phẩm</span>
        <input value={form.name} onChange={onField('name')} required maxLength={200} />
      </label>
      <label>
        <span>Mô tả</span>
        <textarea value={form.description} onChange={onField('description')} rows={3} maxLength={2000} />
      </label>
      <label>
        <span>Giá (VND)</span>
        <input
          type="number"
          min={0}
          step={1000}
          value={form.price}
          onChange={onField('price')}
          required
        />
      </label>
      <label>
        <span>Danh mục</span>
        <select value={form.categoryId} onChange={onField('categoryId')} required>
          <option value="">-- chọn --</option>
          {categories.map((c) => (
            <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
          ))}
        </select>
      </label>

      {/* Khung Tự động liên kết và xem trước hình ảnh */}
      <div className="admin-form-image-preview">
        <div className="admin-form-image-preview__box">
          {computedImageUrl && !previewError ? (
            <img
              src={computedImageUrl}
              alt="Xem trước ảnh sản phẩm"
              onError={() => setPreviewError(true)}
            />
          ) : (
            <div
              className="admin-product-thumb--fallback"
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{
                __html: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none">${getCategoryIconPaths(form.categoryId || form.name)}</svg>`,
              }}
            />
          )}
        </div>
        <div className="admin-form-image-preview__meta">
          <span className="admin-form-image-preview__title">Hình ảnh sản phẩm đang áp dụng:</span>
          <span className="admin-form-image-preview__path">
            {computedImageUrl || '(Chưa có ảnh - hệ thống tự động sinh theo SKU khi lưu)'}
          </span>
          <span className="muted" style={{ fontSize: '12px' }}>
            {form.selectedImage
              ? '✓ Đã chọn từ Bảng chọn ảnh mẫu bên dưới'
              : (form.productId ? `✓ Tự động map theo SKU: ${form.productId.toUpperCase()}` : 'Hệ thống tự động liên kết ảnh chuẩn khi lưu')}
          </span>
        </div>
      </div>

      {/* BẢNG CHỌN ẢNH TRỰC QUAN (IMAGE PICKER GRID) - XÓA BỎ DROPDOWN TEXT THÔ */}
      <ImagePickerGrid
        selectedUrl={computedImageUrl}
        autoUrl={form.productId ? (getProductImageUrl(form.productId, '') || `/images/products/${form.productId.toLowerCase()}.jpg`) : ''}
        onSelect={(newUrl) => setForm((f) => ({ ...f, selectedImage: newUrl }))}
        onResetAuto={() => setForm((f) => ({ ...f, selectedImage: '' }))}
      />

      <label className="admin-form__inline">
        <input type="checkbox" checked={!!form.active} onChange={onField('active')} />
        <span>Đang kinh doanh</span>
      </label>
      <div className="admin-form__actions">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Hủy</button>
        <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
    </form>
  );
}

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const requestSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++requestSeq.current;
    setStatus({ kind: 'loading', error: null });
    try {
      const data = await api.listProducts({ page, pageSize, includeInactive });
      if (seq !== requestSeq.current) return;
      setItems(data.items);
      setTotal(data.total);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message });
    }
  }, [page, pageSize, includeInactive]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    api.listCategories().then((d) => setCategories(d.items || [])).catch(() => {});
  }, []);

  const categoryMap = useMemo(() => {
    const map = new Map();
    (categories || []).forEach((c) => map.set(c.categoryId, c.name));
    return map;
  }, [categories]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onCreate = async (form) => {
    setBusy(true);
    setFormError(null);
    try {
      await api.createProduct(form);
      setCreating(false);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onUpdate = async (form) => {
    setBusy(true);
    setFormError(null);
    try {
      await api.updateProduct(editing.productId, form);
      setEditing(null);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (product) => {
    setBusy(true);
    setFormError(null);
    try {
      await api.deleteProduct(product.productId);
      setConfirmDel(null);
      fetchData();
    } catch (err) {
      setFormError(err.message);
      setConfirmDel(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-crud" aria-label="Quản trị sản phẩm">
      <header className="admin-crud__header">
        <h2>Quản trị sản phẩm</h2>
        <button type="button" className="btn-primary" onClick={() => { setCreating(true); setEditing(null); setFormError(null); }}>
          + Tạo sản phẩm
        </button>
      </header>

      <label className="admin-form__inline">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => { setIncludeInactive(e.target.checked); setPage(1); }}
        />
        <span>Hiện sản phẩm ngừng kinh doanh</span>
      </label>

      {formError && <p className="error-text">{formError}</p>}

      {status.kind === 'loading' && <p className="muted">Đang tải…</p>}
      {status.kind === 'error' && <p className="error-text">Không tải được dữ liệu. Vui lòng thử lại.</p>}

      {creating && (
        <ProductForm
          title="Tạo sản phẩm mới"
          initial={EMPTY_PRODUCT}
          categories={categories}
          onCancel={() => setCreating(false)}
          onSubmit={onCreate}
          busy={busy}
          error={formError}
        />
      )}

      {editing && (
        <ProductForm
          title={`Sửa sản phẩm ${editing.productId}`}
          initial={editing}
          categories={categories}
          onCancel={() => setEditing(null)}
          onSubmit={onUpdate}
          busy={busy}
          error={formError}
        />
      )}

      <div className="admin-table__wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Ảnh</th>
              <th>Mã SKU</th>
              <th>Tên sản phẩm</th>
              <th>Giá</th>
              <th>Danh mục</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const catName = categoryMap.get(p.categoryId);
              return (
                <tr key={p.productId}>
                  <td>
                    <AdminProductThumb
                      productId={p.productId}
                      src={p.imageUrl}
                      alt={p.name}
                      categoryId={p.categoryId}
                    />
                  </td>
                  <td><code>{p.productId}</code></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <strong>{p.name}</strong>
                    </div>
                  </td>
                  <td>{formatVnd(p.price)} đ</td>
                  <td>
                    <span className="admin-cat-text">
                      {catName || p.categoryId || '—'}
                    </span>
                    {catName && p.categoryId && (
                      <span className="muted small" style={{ display: 'block', fontSize: '11px' }}>
                        <code>{p.categoryId}</code>
                      </span>
                    )}
                  </td>
                  <td>{p.active ? <span className="badge badge--primary">Đang KD</span> : <span className="badge badge--warn">Ngừng KD</span>}</td>
                  <td>
                    <button type="button" className="btn-ghost" onClick={() => { setEditing(p); setCreating(false); setFormError(null); }}>Sửa</button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => setConfirmDel(p)}
                    >Xóa</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="admin-crud__footer">
        <span className="muted small">Tổng số {total} sản phẩm</span>
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
          <span className="muted small">/ {totalPages}</span>
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

      {confirmDel && (
        <div className="confirm-dialog" role="dialog" aria-label="Xác nhận xóa">
          <div className="confirm-dialog__panel">
            <h3>Xóa sản phẩm?</h3>
            <p>Sản phẩm <strong>{confirmDel.name}</strong> sẽ bị xóa cùng BELONGS_TO nếu không có lịch sử mua/xem.</p>
            {confirmDel.active === false && <p className="muted">Sản phẩm đang ngừng kinh doanh, có thể xóa nếu không có lịch sử.</p>}
            <div className="admin-form__actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDel(null)} disabled={busy}>Hủy</button>
              <button type="button" className="btn-danger" onClick={() => onDelete(confirmDel)} disabled={busy} aria-busy={busy}>
                {busy ? 'Đang xóa…' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
