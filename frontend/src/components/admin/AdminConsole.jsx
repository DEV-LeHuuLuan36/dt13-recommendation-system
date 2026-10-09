import { useState } from 'react';
import AdminProducts from './AdminProducts.jsx';
import AdminCategories from './AdminCategories.jsx';
import AdminCustomers from './AdminCustomers.jsx';
import AdminRecommendationGraph from './AdminRecommendationGraph.jsx';

const TABS = [
  { key: 'products', label: 'Sản phẩm' },
  { key: 'categories', label: 'Danh mục' },
  { key: 'customers', label: 'Khách hàng' },
  { key: 'graph', label: 'Phân tích gợi ý' },
];

export default function AdminConsole({ onBack }) {
  const [tab, setTab] = useState('products');
  return (
    <section className="admin-console" aria-label="Quản trị">
      <header className="admin-console__header">
        <button type="button" className="btn-ghost" onClick={onBack}>← Quay lại</button>
        <h1>Quản trị</h1>
        <div className="admin-console__tabs" role="tablist">
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
        </div>
      </header>
      {tab === 'products' && <AdminProducts onBack={onBack} />}
      {tab === 'categories' && <AdminCategories onBack={onBack} />}
      {tab === 'customers' && <AdminCustomers onBack={onBack} />}
      {tab === 'graph' && <AdminRecommendationGraph onBack={onBack} />}
    </section>
  );
}
