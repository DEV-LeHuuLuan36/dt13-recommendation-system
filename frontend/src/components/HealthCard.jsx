import StatusBadge from './StatusBadge.jsx';

const MESSAGES = {
  loading: 'Dang tai...',
  connected: 'Ket noi thanh cong',
  'not-configured': 'Chua cau hinh ket noi Neo4j',
  error: 'Khong the ket noi',
};

export default function HealthCard({ title, description, state }) {
  const extra = Array.isArray(state.extra) ? state.extra : [];
  return (
    <article className={`health-card health-card--${state.status}`} aria-live="polite">
      <header>
        <h2>{title}</h2>
        <StatusBadge status={state.status} label={MESSAGES[state.status] || state.status} />
      </header>
      <p className="health-card__desc">{description}</p>
      {extra && extra.length > 0 && (
        <ul className="health-card__extra">
          {extra.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {state.detail && state.detail.timestamp && (
        <p className="health-card__meta">
          Phan hoi luc: <time dateTime={state.detail.timestamp}>{new Date(state.detail.timestamp).toLocaleString('vi-VN')}</time>
        </p>
      )}
      {state.error && (
        <p className="health-card__error" role="status">
          {state.error}
        </p>
      )}
    </article>
  );
}