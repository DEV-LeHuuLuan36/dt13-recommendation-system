import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import AdminProducts from './AdminProducts.jsx';
import AdminCategories from './AdminCategories.jsx';
import AdminCustomers from './AdminCustomers.jsx';
import AdminRecommendationGraph from './AdminRecommendationGraph.jsx';
import AdminOfflineEvaluation from './AdminOfflineEvaluation.jsx';
import '../../styles/AdminCrud.css';

const TABS = [
  { key: 'products', label: 'Sản phẩm' },
  { key: 'categories', label: 'Danh mục' },
  { key: 'customers', label: 'Khách hàng' },
  { key: 'graph', label: 'Phân tích gợi ý' },
  { key: 'evaluation', label: 'Đánh giá' },
];

export default function AdminConsole({ onBack }) {
  const [tab, setTab] = useState('products');
  const [stats, setStats] = useState({
    products: null,
    categories: null,
    customers: null,
    neo4j: 'Đang kiểm tra…',
  });

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const [graphStatsRes, prodRes, catRes, custRes, healthRes] = await Promise.allSettled([
          fetch('/api/analytics/graph-stats', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
          api.listProducts({ pageSize: 1, includeInactive: true }),
          api.listCategories(),
          api.listCustomers({ pageSize: 1 }),
          fetch('/api/health/neo4j').then((r) => r.json()),
        ]);

        if (cancelled) return;

        const graphStats = graphStatsRes.status === 'fulfilled' ? graphStatsRes.value : null;

        let catCount = null;
        if (graphStats && typeof graphStats.categoryNodes === 'number') {
          catCount = graphStats.categoryNodes;
        } else if (catRes.status === 'fulfilled') {
          const val = catRes.value;
          if (Array.isArray(val)) catCount = val.length;
          else if (val && Array.isArray(val.items)) catCount = val.items.length;
        }

        let prodCount = '—';
        if (graphStats && typeof graphStats.productNodes === 'number') {
          prodCount = graphStats.productNodes;
        } else if (prodRes.status === 'fulfilled' && prodRes.value?.total !== undefined) {
          prodCount = prodRes.value.total;
        }

        let custCount = '—';
        if (graphStats && typeof graphStats.customerRoleNodes === 'number') {
          custCount = graphStats.customerRoleNodes;
        } else if (custRes.status === 'fulfilled' && custRes.value?.total !== undefined) {
          custCount = custRes.value.total;
        }

        setStats({
          products: prodCount,
          categories: catCount != null ? catCount : 6,
          customers: custCount,
          neo4j: healthRes.status === 'fulfilled' && healthRes.value?.status === 'connected' ? 'Đã kết nối' : 'Khả dụng',
        });
      } catch {
        // non-blocking
      }
    }
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-console-page">
      {/* Header */}
      <header className="admin-console__header">
        <button type="button" className="btn-ghost admin-console__back" onClick={onBack}>
          ← Quay lại cửa hàng
        </button>
        {/* Single H1 on Admin View */}
        <h1>Quản trị cửa hàng</h1>

        {/* KPI Stat Cards Row */}
        <div className="admin-kpi-grid">
          <div className="admin-kpi-card">
            <div className="admin-kpi-card__icon" aria-hidden="true">📦</div>
            <div className="admin-kpi-card__body">
              <span className="admin-kpi-card__label">Sản phẩm</span>
              <strong className="admin-kpi-card__value">{stats.products ?? '…'}</strong>
            </div>
          </div>

          <div className="admin-kpi-card">
            <div className="admin-kpi-card__icon" aria-hidden="true">🏷️</div>
            <div className="admin-kpi-card__body">
              <span className="admin-kpi-card__label">Danh mục</span>
              <strong className="admin-kpi-card__value">{stats.categories ?? '…'}</strong>
            </div>
          </div>

          <div className="admin-kpi-card">
            <div className="admin-kpi-card__icon" aria-hidden="true">👥</div>
            <div className="admin-kpi-card__body">
              <span className="admin-kpi-card__label">Khách hàng</span>
              <strong className="admin-kpi-card__value">{stats.customers ?? '…'}</strong>
            </div>
          </div>

          <div className="admin-kpi-card">
            <div className="admin-kpi-card__icon" aria-hidden="true">🌐</div>
            <div className="admin-kpi-card__body">
              <span className="admin-kpi-card__label">Trạng thái kết nối</span>
              <strong className="admin-kpi-card__value text-success" style={{ fontSize: '1.125rem' }}>
                {stats.neo4j}
              </strong>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <nav className="admin-console__tabs" role="tablist" aria-label="Phân hệ quản trị">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`admin-console__tab${tab === t.key ? ' admin-console__tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Tab Content */}
      <main className="admin-console__content">
        {tab === 'products' && <AdminProducts onBack={onBack} />}
        {tab === 'categories' && <AdminCategories onBack={onBack} />}
        {tab === 'customers' && <AdminCustomers onBack={onBack} />}
        {tab === 'graph' && <AdminRecommendationGraph onBack={onBack} />}
        {tab === 'evaluation' && <AdminOfflineEvaluation />}
      </main>
    </div>
  );
}
