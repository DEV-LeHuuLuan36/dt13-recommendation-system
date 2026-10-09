import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import '../../styles/AdminCrud.css';

const EMPTY = { name: '', description: '' };

function CategoryForm({ initial, onCancel, onSubmit, busy, error, title }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
  });
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
        <span>Tên danh mục</span>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required maxLength={200} />
      </label>
      <label>
        <span>Mô tả</span>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          maxLength={2000}
        />
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

export default function AdminCategories() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState({ kind: 'loading', error: null });
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
      const d = await api.listCategories();
      if (seq !== requestSeq.current) return;
      setItems(d.items);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message });
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onCreate = async (form) => {
    setBusy(true);
    setFormError(null);
    try {
      await api.createCategory(form);
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
      await api.updateCategory(editing.categoryId, form);
      setEditing(null);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const onDelete = async (cat) => {
    setBusy(true);
    setFormError(null);
    try {
      await api.deleteCategory(cat.categoryId);
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
    <section className="admin-crud" aria-label="Quản trị danh mục">
      <header className="admin-crud__header">
        <h2>Quản trị danh mục</h2>
        <button type="button" className="btn-primary" onClick={() => { setCreating(true); setEditing(null); setFormError(null); }}>
          + Tạo danh mục
        </button>
      </header>

      {formError && <p className="error-text">{formError}</p>}
      {status.kind === 'loading' && <p className="muted">Đang tải…</p>}
      {status.kind === 'error' && <p className="error-text">Không tải được dữ liệu. Vui lòng thử lại.</p>}

      {creating && (
        <CategoryForm
          title="Tạo danh mục mới"
          initial={EMPTY}
          onCancel={() => setCreating(false)}
          onSubmit={onCreate}
          busy={busy}
          error={formError}
        />
      )}
      {editing && (
        <CategoryForm
          title={`Sửa danh mục ${editing.categoryId}`}
          initial={editing}
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
              <th>Số sản phẩm</th>
              <th>Mô tả</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.categoryId}>
                <td><code>{c.categoryId}</code></td>
                <td>{c.name}</td>
                <td>{c.productCount ?? 0}</td>
                <td>{c.description || '-'}</td>
                <td>
                  <button type="button" className="btn-ghost" onClick={() => { setEditing(c); setCreating(false); setFormError(null); }}>Sửa</button>
                  <button type="button" className="btn-danger" onClick={() => setConfirmDel(c)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDel && (
        <div className="confirm-dialog" role="dialog" aria-label="Xác nhận xóa">
          <div className="confirm-dialog__panel">
            <h3>Xóa danh mục?</h3>
            <p>Danh mục <strong>{confirmDel.name}</strong> sẽ bị xóa nếu không còn sản phẩm.</p>
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
