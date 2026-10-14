import { useState } from 'react';
import { loginRequest } from '../api/auth.js';
import '../styles/Login.css';

const DEMO_ACCOUNTS = [
  { badge: 'ADMIN', label: 'Quản trị viên (ADMIN_001)', email: 'admin@example.test', customerId: 'ADMIN_001', password: 'Admin@001' },
  { badge: 'REF CATALOG', label: 'Khách hàng RC 1 (rc_c001)', email: 'nguyen.minh.an.001@example.test', customerId: 'RC_C001', password: 'RcCust@001' },
  { badge: 'REF CATALOG', label: 'Khách hàng RC 2 (rc_c002)', email: 'tran.ngoc.bao.002@example.test', customerId: 'RC_C002', password: 'RcCust@002' },
  { badge: 'SEED V1', label: 'Khách hàng 1 (CUST_001)', email: 'cust001@example.test', customerId: 'CUST_001', password: 'Cust@001' },
  { badge: 'SEED V1', label: 'Khách hàng 2 (CUST_002)', email: 'cust002@example.test', customerId: 'CUST_002', password: 'Cust@002' },
  { badge: 'COLD START', label: 'Khách hàng 5 (CUST_005)', email: 'cust005@example.test', customerId: 'CUST_005', password: 'Cust@005' },
];

export default function LoginForm({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = await loginRequest(email.trim(), password);
      onLoggedIn(body.profile);
    } catch (err) {
      setError(err.message || 'Không thể đăng nhập.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="login-form" onSubmit={onSubmit} aria-label="Form đăng nhập" noValidate>
      <div className="login-form__brand" aria-hidden="true">
        <span className="login-form__brand-mark">13</span>
        <span className="login-form__brand-text">DT13 Store</span>
      </div>
      <h1>Chào mừng trở lại</h1>
      <p className="muted">Đăng nhập để trải nghiệm hệ thống gợi ý sản phẩm Neo4j cá nhân hóa.</p>

      <label className="login-field">
        <span>Email hoặc Customer ID</span>
        <input
          type="text"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? 'true' : 'false'}
          placeholder="admin@example.test hoặc CUST_001 / rc_c001..."
        />
      </label>

      <label className="login-field">
        <span>Mật khẩu</span>
        <div className="login-password">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="login-password__toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-pressed={showPassword}
          >
            {showPassword ? 'Ẩn' : 'Hiện'}
          </button>
        </div>
      </label>

      {error && (
        <p className="login-error" role="alert">{error}</p>
      )}

      <button type="submit" className="btn-primary login-submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'Đang xử lý…' : 'Đăng nhập'}
      </button>

      <div className="login-quick">
        <span className="login-quick__title">Chọn nhanh tài khoản Demo (Tự động điền an toàn):</span>
        <div className="login-quick__grid">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              className="login-quick__card"
              onClick={() => {
                setEmail(acc.email);
                setPassword(acc.password);
                setError(null);
              }}
              title={`Chọn tài khoản ${acc.label}`}
            >
              <div className="login-quick__badge-row">
                <span className={`login-quick__badge login-quick__badge--${acc.badge.toLowerCase().replace(/\s+/g, '-')}`}>
                  {acc.badge}
                </span>
              </div>
              <span className="login-quick__name">{acc.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="login-rule-box">
        <div className="login-rule-box__header">
          <svg className="login-rule-box__icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <strong>Hệ thống xác thực Neo4j Scrypt:</strong>
        </div>
        <p className="login-rule-box__desc" style={{ fontSize: '13px', lineHeight: '1.5', margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>
          Hệ thống mã hóa chuẩn <code>scrypt</code> bảo vệ tài khoản người dùng độc lập trong cơ sở dữ liệu Neo4j.
          Tra cứu danh mục tài khoản mẫu và thông tin kiểm thử dành cho giảng viên tại tài liệu <code>ACCOUNTS.md</code> ở thư mục gốc của dự án.
        </p>
      </div>
    </form>
  );
}
