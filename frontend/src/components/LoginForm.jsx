import { useState } from 'react';
import { loginRequest } from '../api/auth.js';
import '../styles/Login.css';

// Demo accounts for quickly populating the email field
const DEMO_ACCOUNTS = [
  {
    label: 'Quản trị viên',
    email: 'admin@example.test',
  },
  {
    label: 'Khách hàng 01',
    email: 'nguyen.minh.an.001@example.test',
  },
  {
    label: 'Khách hàng 02',
    email: 'tran.ngoc.bao.002@example.test',
  },
  {
    label: 'Khách hàng 03',
    email: 'le.hoai.chi.003@example.test',
  },
  {
    label: 'Khách hàng 04',
    email: 'pham.quoc.dung.004@example.test',
  },
  {
    label: 'Khách hàng 05',
    email: 'hoang.my.duyen.005@example.test',
  },
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
        <span className="login-form__brand-mark">GY</span>
        <span className="login-form__brand-text">Gợi Ý</span>
      </div>
      <h1>Chào mừng trở lại</h1>
      <p className="muted">Đăng nhập để trải nghiệm mua sắm và nhận gợi ý cá nhân hóa.</p>

      <label className="login-field">
        <span>Email hoặc tài khoản</span>
        <input
          type="text"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? 'true' : 'false'}
          placeholder="Nhập email của bạn..."
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
            placeholder="Nhập mật khẩu..."
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

      {/* Demo Quick Account Selector (local/demo testing) */}
      <div className="login-quick">
        <span className="login-quick__title">Chọn nhanh tài khoản:</span>
        <div className="login-quick__grid">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              className="login-quick__card"
              onClick={() => {
                setEmail(acc.email);
                setPassword('');
                setError(null);
              }}
              title={`Đăng nhập ${acc.label}`}
            >
              <span className="login-quick__name">{acc.label}</span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
