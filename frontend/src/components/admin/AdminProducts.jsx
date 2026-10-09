import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { formatVnd } from '../../utils/format.js';
import '../../styles/AdminCrud.css';

const EMPTY_PRODUCT = {
  name: '',
  description: '',
  price: 0,
  categoryId: '',
  imageUrl: '',
  active: true,
};

function ProductForm({ initial, categories, onCancel, onSubmit, busy, error, title }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? 0,
    categoryId: initial?.categoryId ?? (categories[0]?.categoryId ?? ''),
    imageUrl: initial?.imageUrl ?? '',
    active: initial?.active ?? true,
  }));

  const onField = (k) => (e) => {
    const v = k === 'active' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: k === 'price' ? Number(v) : v }));
  };

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <h3>{title}</h3>
      {error && <p className="error-text">{error}</p>}
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
      <label>
        <span>Đường dẫn ảnh (để trống để dùng ảnh mặc định)</span>
        <input value={form.imageUrl || ''} onChange={onField('imageUrl')} placeholder="/images/products/..." />
      </label>
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
              <th>Mã</th>
              <th>Tên</th>
              <th>Giá</th>
              <th>Danh mục</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.productId}>
                <td><code>{p.productId}</code></td>
                <td>{p.name}</td>
                <td>{formatVnd(p.price)} đ</td>
                <td>{p.categoryId || '-'}</td>
                <td>{p.active ? <span className="badge badge--primary">Đang KD</span> : <span className="badge badge--warn">Ngừng</span>}</td>
                <td>
                  <button type="button" className="btn-ghost" onClick={() => { setEditing(p); setCreating(false); setFormError(null); }}>Sửa</button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => setConfirmDel(p)}
                  >Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="admin-crud__footer">
        <span className="muted">Tổng {total} sản phẩm</span>
        <div className="pagination">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Trước</button>
          <span>Trang {page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Sau</button>
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
