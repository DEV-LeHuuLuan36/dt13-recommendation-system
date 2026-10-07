import { useCallback, useEffect, useState } from 'react';
import HealthCard from './components/HealthCard.jsx';
import Neo4jStatus from './components/Neo4jStatus.jsx';
import { fetchApiHealth, fetchNeo4jHealth } from './api/health.js';
import './styles/App.css';

const POLL_INTERVAL_MS = 15000;

export default function App() {
  const [apiState, setApiState] = useState({ status: 'loading', detail: null, error: null });
  const [neo4jState, setNeo4jState] = useState({ status: 'loading', detail: null, error: null });
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkAll = useCallback(async () => {
    setRefreshing(true);
    setApiState((s) => ({ ...s, status: 'loading' }));
    setNeo4jState((s) => ({ ...s, status: 'loading' }));

    const [api, neo4j] = await Promise.all([fetchApiHealth(), fetchNeo4jHealth()]);
    setApiState(api);
    setNeo4jState(neo4j);
    setLastCheckedAt(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    checkAll();
    const id = setInterval(checkAll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [checkAll]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Đề tài 13 — NoSQL</p>
        <h1>Hệ thống gợi ý sản phẩm tương quan</h1>
        <p className="lede">
          Bản khởi tạo (Giai đoạn 1). Trang này kiểm tra API Express và kết nối Neo4j. Chưa có dữ liệu gợi ý thật.
        </p>
      </header>

      <section className="status-grid" aria-label="Trạng thái kết nối">
        <HealthCard
          title="API (Express)"
          state={apiState}
          description="Endpoint /api/health trả về trạng thái dịch vụ backend. Không phụ thuộc Neo4j."
        />
        <Neo4jStatus state={neo4jState} />
      </section>

      <section className="actions">
        <button
          type="button"
          onClick={checkAll}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
        </button>
        {lastCheckedAt && (
          <p className="last-checked">
            Lần kiểm tra gần nhất: <time dateTime={lastCheckedAt.toISOString()}>{lastCheckedAt.toLocaleString('vi-VN')}</time>
          </p>
        )}
      </section>

      <footer className="app-footer">
        <p>
          Môi trường: Node 24, npm 11, React + Vite. Kết nối CSDL sử dụng neo4j-driver chính thức chạy ở backend.
        </p>
      </footer>
    </main>
  );
}