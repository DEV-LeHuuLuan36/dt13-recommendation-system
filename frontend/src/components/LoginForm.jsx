import { useState } from 'react';
import { loginRequest } from '../api/auth.js';
import '../styles/Login.css';

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
        <span className="login-form__brand-mark">G</span>
        <span className="login-form__brand-text">Gợi Ý</span>
      </div>
      <h1>Chào mừng trở lại</h1>
      <p className="muted">Đăng nhập để tiếp tục mua sắm và nhận gợi ý cá nhân.</p>

      <label className="login-field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? 'true' : 'false'}
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

      <p className="login-form__hint muted">
        Tài khoản demo được liệt kê trong tài liệu nội bộ. Liên hệ quản trị viên nếu bạn cần cấp quyền.
      </p>
    </form>
  );
}
