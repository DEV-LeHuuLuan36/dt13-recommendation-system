import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { formatDateTime, normalizeSearchText } from '../../utils/format.js';
import '../../styles/AdminCrud.css';

const EMPTY = { name: '', email: '', password: '' };

function CustomerForm({ initial, onCancel, onSubmit, busy, error, title }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    password: '',
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
        <span>Tên khách</span>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required maxLength={200} />
      </label>
      <label>
        <span>Email</span>
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
      </label>
      <label>
        <span>Mật khẩu (ít nhất 8 ký tự)</span>
        <input
          type="password"
          minLength={8}
          maxLength={256}
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
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

function CustomerEditForm({ initial, onCancel, onSubmit, busy, error }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    email: initial.email || '',
    active: initial.active !== false,
  });
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <h3>Sửa khách {initial.customerId}</h3>
      {error && <p className="error-text">{error}</p>}
      <label>
        <span>Tên</span>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required maxLength={200} />
      </label>
      <label>
        <span>Email</span>
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
      </label>
      <label className="admin-form__inline">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
        />
        <span>Tài khoản đang hoạt động</span>
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

export default function AdminCustomers() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [status, setStatus] = useState({ kind: 'loading', error: null });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const requestSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++requestSeq.current;
    setStatus({ kind: 'loading', error: null });
    try {
      const d = await api.listCustomers({ page, pageSize, q: normalizeSearchText(q) });
      if (seq !== requestSeq.current) return;
      setItems(d.items);
      setTotal(d.total);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setStatus({ kind: 'error', error: err.message });
    }
  }, [page, pageSize, q]);

  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const onSubmitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput);
  };
  const onClearSearch = () => {
    setPage(1);
    setQInput('');
    setQ('');
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onCreate = async (form) => {
    setBusy(true);
    setFormError(null);
    try {
      await api.createCustomer(form);
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
      await api.updateCustomer(editing.customerId, form);
      setEditing(null);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (c) => {
    setBusy(true);
    setFormError(null);
    try {
      await api.deleteCustomer(c.customerId);
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
    <section className="admin-crud" aria-label="Quản trị khách hàng">
      <header className="admin-crud__header">
        <h2>Quản trị khách hàng</h2>
        <button type="button" className="btn-primary" onClick={() => { setCreating(true); setEditing(null); setFormError(null); }}>
          + Tạo khách
        </button>
      </header>

      <form className="admin-crud__search" onSubmit={onSubmitSearch} role="search">
        <label className="admin-form__inline">
          <span className="visually-hidden">Tìm khách</span>
          <input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Tên, email hoặc mã khách…" />
        </label>
        <button type="submit" className="btn-primary">Áp dụng</button>
        {q && <button type="button" className="btn-ghost" onClick={onClearSearch}>Xóa</button>}
      </form>

      {formError && <p className="error-text">{formError}</p>}
      {status.kind === 'loading' && <p className="muted">Đang tải…</p>}
      {status.kind === 'error' && <p className="error-text">Không tải được dữ liệu. Vui lòng thử lại.</p>}

      {creating && (
        <CustomerForm
          title="Tạo khách hàng mới"
          initial={EMPTY}
          onCancel={() => setCreating(false)}
          onSubmit={onCreate}
          busy={busy}
          error={formError}
        />
      )}
      {editing && (
        <CustomerEditForm
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
              <th>Email</th>
              <th>Trạng thái</th>
              <th>Tạo lúc</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.customerId}>
                <td><code>{c.customerId}</code></td>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.active === false ? <span className="badge badge--warn">Ngừng</span> : <span className="badge badge--primary">Hoạt động</span>}</td>
                <td>{formatDateTime(c.createdAt)}</td>
                <td>
                  <button type="button" className="btn-ghost" onClick={() => { setEditing(c); setCreating(false); setFormError(null); }}>Sửa</button>
                  <button type="button" className="btn-danger" onClick={() => setConfirmDel(c)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="admin-crud__footer">
        <span className="muted">Tổng {total} khách</span>
        <div className="pagination">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Trước</button>
          <span>Trang {page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Sau</button>
        </div>
      </footer>

      {confirmDel && (
        <div className="confirm-dialog" role="dialog" aria-label="Xác nhận xóa">
          <div className="confirm-dialog__panel">
            <h3>Xóa khách hàng?</h3>
            <p>Khách <strong>{confirmDel.name}</strong> ({confirmDel.email}) sẽ bị xóa nếu chưa có lịch sử mua/xem.</p>
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
