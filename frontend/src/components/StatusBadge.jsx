const LABELS = {
  loading: 'Dang tai',
  connected: 'OK',
  'not-configured': 'Chua cau hinh',
  error: 'Loi',
};

export default function StatusBadge({ status, label }) {
  return (
    <span className={`status-badge status-badge--${status}`} data-status={status}>
      <span className="status-badge__dot" aria-hidden="true" />
      <span className="status-badge__text">{LABELS[status] || status} — {label}</span>
    </span>
  );
}