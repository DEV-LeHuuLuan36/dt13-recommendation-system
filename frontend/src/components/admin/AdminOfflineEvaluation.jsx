import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

export default function AdminOfflineEvaluation() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runEval = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOfflineEvaluation();
      setData(res);
    } catch (err) {
      setError(err.message || 'Lỗi khi chạy đánh giá offline.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runEval();
  }, []);

  return (
    <div className="admin-eval-panel" style={{ padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px 0', color: '#0f172a' }}>
            📊 Đánh giá Chất lượng & Hiệu năng Hệ gợi ý (Offline Evaluation)
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Kiểm thử phương pháp đánh giá Leave-one-out trên 60 khách hàng và 120 sản phẩm thực tế của đồ án.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={runEval}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {loading ? 'Đang đo lường…' : '🔄 Chạy lại đánh giá'}
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p className="muted">Đang tính toán ma trận tương đồng, đo Recall@10, NDCG@10 và độ trễ truy vấn Neo4j…</p>
        </div>
      )}

      {error && (
        <div className="error-text" style={{ padding: '16px', marginBottom: '20px' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>Không thể thực hiện đánh giá:</p>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {data && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>Tập khách hàng đánh giá</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                {data.evaluatedUsersCount} người
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Có từ 2 giao dịch mua trở lên</span>
            </div>

            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>Quy mô Catalog</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                {data.catalogTotalProducts} sản phẩm
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>100% sản phẩm active</span>
            </div>

            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>Độ trễ phản hồi (Median)</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', margin: '4px 0' }}>
                {data.performance?.medianMs} ms
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>p95: {data.performance?.p95Ms} ms ({data.performance?.samples} mẫu)</span>
            </div>

            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>Tỷ lệ đổi mới giữa các Visit</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', margin: '4px 0' }}>
                {data.comparison?.hybridFeed?.rotationRateBetweenVisitsPercent != null
                  ? `${data.comparison.hybridFeed.rotationRateBetweenVisitsPercent}%`
                  : 'Chưa đủ dữ liệu'}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mục tiêu cấu hình: 20–30%</span>
              {data.comparison?.hybridFeed?.rotationRateBetweenVisitsPercent != null &&
                data.comparison.hybridFeed.rotationRateBetweenVisitsPercent < 20 && (
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, marginTop: '2px' }}>
                    Chưa đạt mục tiêu
                  </span>
                )}
            </div>
          </div>

          {/* Comparison Table */}
          <div>
            <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '12px', color: '#1e293b' }}>
              Bảng so sánh chất lượng các thuật toán gợi ý
            </h3>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Thuật toán / Phương pháp</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Recall@10</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>NDCG@10</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Độ phủ Catalog (%)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Đặc điểm chính</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>Phổ biến đơn giản (Popularity)</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>
                      {data.comparison?.popularity?.recallAt10}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>
                      {data.comparison?.popularity?.ndcgAt10}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>8.3%</td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>Không cá nhân hóa; chỉ lặp lại top sản phẩm bán chạy</td>
                  </tr>

                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>CF Mua chung (Baseline đề tài)</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                      {data.comparison?.baselineCF?.recallAt10}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                      {data.comparison?.baselineCF?.ndcgAt10}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                      {data.comparison?.baselineCF?.catalogCoveragePercent}%
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>Chính xác cao khi có mua chung; gặp hạn chế cold-start</td>
                  </tr>

                  <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                    <td style={{ padding: '12px 16px', color: '#7c3aed', fontWeight: 700 }}>
                      ⭐ Hệ gợi ý lai đa nguồn (Hybrid Feed mới)
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#059669' }}>
                      {data.comparison?.hybridFeed?.recallAt10}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#059669' }}>
                      {data.comparison?.hybridFeed?.ndcgAt10}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#7c3aed' }}>
                      {data.comparison?.hybridFeed?.catalogCoveragePercent}%
                    </td>
                    <td style={{ padding: '12px 16px', color: '#334155' }}>
                      Kết hợp CF + Đa hành vi (Weighted Jaccard) + Ý định tìm kiếm + Suy giảm thời gian
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Technical Specifications Callout */}
          <div style={{ background: '#f1f5f9', padding: '18px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b' }}>
              📐 Công thức & Thông số thực tế triển khai
            </h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.6 }}>
              <li><strong>Trọng số hành vi:</strong> Mua (BOUGHT) = 3.0, Xem (VIEWED) = 1.0, Tìm kiếm (SEARCH) = 0.5.</li>
              <li><strong>Độ tương đồng người dùng:</strong> Weighted Jaccard: <code>sim(u,v) = sum(min(wu,p, wv,p)) / sum(max(wu,p, wv,p))</code>.</li>
              <li><strong>Hàm suy giảm thời gian:</strong> <code>decay = 2^(-ageDays / halfLifeDays)</code> (Tìm kiếm: 7 ngày, Xem: 14 ngày, Mua: 60 ngày).</li>
              <li><strong>Khử lặp & Giảm tải:</strong> Trừ 0.25 điểm cho các sản phẩm đã hiển thị (impression) trong vòng 14 ngày gần nhất.</li>
              <li><strong>Xoay vòng có kiểm soát:</strong> Giữ 35% lựa chọn hàng đầu, luân chuyển ngẫu nhiên có kiểm soát (deterministic PRNG seed) phần còn lại đạt tỷ lệ thay mới 20–30% giữa các visit.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
