import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import '../../styles/AdminCrud.css';
import '../../styles/RecommendationGraph.css';

const MODES = [
  { key: 'user_cf', label: 'CF cá nhân (user_cf - Dành cho bạn)' },
  { key: 'co_bought', label: 'Mua cùng (co_bought - Sản phẩm mua kèm)' },
];

const NODE_RADIUS = 30;
const CANVAS_W = 760;
const CANVAS_H = 480;

// Layout algorithm:
//   customer:target     — center
//   customer:peer       — ring around target
//   product:item/shared — grouped nearby
//   product:source      — top, when co_bought
function layoutNodes(nodes) {
  const target = nodes.find((n) => n.type === 'customer:target');
  const peers = nodes.filter((n) => n.type === 'customer:peer');
  const items = nodes.filter((n) => n.type === 'product:item');
  const shared = nodes.filter((n) => n.type === 'product:shared');
  const source = nodes.find((n) => n.type === 'product:source');
  const positions = new Map();

  if (target) {
    positions.set(target.id, { x: CANVAS_W / 2, y: CANVAS_H / 2 });
  }
  if (source) {
    positions.set(source.id, { x: CANVAS_W / 2, y: 80 });
  }
  const peerR = 160;
  peers.forEach((p, i) => {
    const ang = (Math.PI * 2 * i) / Math.max(peers.length, 1);
    positions.set(p.id, {
      x: CANVAS_W / 2 + Math.cos(ang) * peerR,
      y: CANVAS_H / 2 + Math.sin(ang) * peerR,
    });
  });
  const itemR = 210;
  items.forEach((p, i) => {
    const ang = Math.PI + (Math.PI * (i + 1)) / Math.max(items.length + 1, 1);
    positions.set(p.id, {
      x: CANVAS_W / 2 + Math.cos(ang) * itemR,
      y: CANVAS_H / 2 + Math.sin(ang) * itemR,
    });
  });
  const sharedR = 85;
  shared.forEach((p, i) => {
    const ang = (Math.PI * 2 * i) / Math.max(shared.length, 1);
    positions.set(p.id, {
      x: CANVAS_W / 2 + Math.cos(ang) * sharedR,
      y: CANVAS_H / 2 + Math.sin(ang) * sharedR,
    });
  });
  return positions;
}

function colorForType(type) {
  if (type === 'customer:target') return '#2563eb'; // Blue
  if (type === 'customer:peer') return '#3b82f6';   // Light Blue
  if (type === 'product:source') return '#d97706';  // Amber
  if (type === 'product:item') return '#059669';    // Emerald
  if (type === 'product:shared') return '#7c3aed';  // Purple
  return '#64748b';
}

function colorForEdge(type) {
  if (type === 'BOUGHT') return '#059669';
  if (type === 'VIEWED') return '#d97706';
  return '#cbd5e1';
}

function fitView(nodes, positions) {
  if (nodes.length === 0) return { viewBox: `0 0 ${CANVAS_W} ${CANVAS_H}` };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 80; // Safe margin for text labels
  return {
    viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`,
  };
}

export default function AdminRecommendationGraph() {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [mode, setMode] = useState('user_cf');
  const [productId, setProductId] = useState('');
  const [limit, setLimit] = useState(5);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ kind: 'idle', error: null });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const formRef = useRef(null);

  // Load initial select options (respecting backend MAX_PAGE_SIZE = 50)
  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const [c1, c2, p1, p2, p3] = await Promise.all([
          api.listCustomers({ page: 1, pageSize: 50 }).catch(() => ({ items: [] })),
          api.listCustomers({ page: 2, pageSize: 50 }).catch(() => ({ items: [] })),
          api.listProducts({ page: 1, pageSize: 50 }).catch(() => ({ items: [] })),
          api.listProducts({ page: 2, pageSize: 50 }).catch(() => ({ items: [] })),
          api.listProducts({ page: 3, pageSize: 50 }).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;

        const allCustomers = [
          ...(Array.isArray(c1) ? c1 : (c1?.items || [])),
          ...(Array.isArray(c2) ? c2 : (c2?.items || [])),
        ].filter((c) => c && c.customerId);

        const allProducts = [
          ...(Array.isArray(p1) ? p1 : (p1?.items || [])),
          ...(Array.isArray(p2) ? p2 : (p2?.items || [])),
          ...(Array.isArray(p3) ? p3 : (p3?.items || [])),
        ].filter((p) => p && p.productId);

        setCustomers(allCustomers);
        setProducts(allProducts);

        const defaultCust = allCustomers.find((c) => c.customerId.toLowerCase() === 'rc_c001')
          || allCustomers.find((c) => c.customerId === 'CUST_001')
          || allCustomers[0];

        const defaultProd = allProducts.find((p) => p.productId.toLowerCase() === 'rc_p001')
          || allProducts.find((p) => p.productId === 'PROD_001')
          || allProducts[0];

        if (defaultCust) setCustomerId(defaultCust.customerId);
        if (defaultProd) setProductId(defaultProd.productId);

        setLoadingOptions(false);

        // Auto-run first analysis for instant wow-effect live demo
        if (defaultCust) {
          api.getGraphRecommendation({
            customerId: defaultCust.customerId,
            mode: 'user_cf',
            limit: 5,
          }).then((res) => {
            if (!cancelled) {
              setData(res);
              setStatus({ kind: 'ready', error: null });
            }
          }).catch(() => {
            /* non-blocking */
          });
        }
      } catch {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    }
    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const onAnalyze = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!customerId) return;
    setStatus({ kind: 'loading', error: null });
    try {
      const res = await api.getGraphRecommendation({
        customerId,
        mode,
        productId: mode === 'co_bought' ? productId : undefined,
        limit,
      });
      setData(res);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      setStatus({ kind: 'error', error: err.message });
      setData(null);
    }
  }, [customerId, mode, productId, limit]);

  const positions = useMemo(() => {
    if (!data) return new Map();
    return layoutNodes(data.nodes);
  }, [data]);

  const viewBox = useMemo(() => {
    if (!data) return { viewBox: `0 0 ${CANVAS_W} ${CANVAS_H}` };
    return fitView(data.nodes, positions);
  }, [data, positions]);

  return (
    <section className="admin-section" aria-label="Phân tích gợi ý đồ thị">
      <div className="admin-section__head">
        <h2>Trực quan hóa Đồ thị Thuật toán Gợi ý (Graph Inspection)</h2>
        <p className="muted">
          Kiểm toán các đường đi cạnh <code>:BOUGHT</code> và <code>:VIEWED</code> trong Neo4j để giải thích vì sao sản phẩm được đề xuất cho khách hàng.
        </p>
      </div>

      <form ref={formRef} onSubmit={onAnalyze} className="admin-form admin-form--inline">
        <label className="admin-form__field">
          <span>Khách hàng mục tiêu</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            disabled={loadingOptions}
          >
            {loadingOptions ? (
              <option value="">Đang tải danh sách khách hàng…</option>
            ) : customers.length === 0 ? (
              <option value="">Không có khách hàng</option>
            ) : (
              customers.map((c) => (
                <option key={c.customerId} value={c.customerId}>
                  {c.customerId} - {c.name} {c.email ? `(${c.email})` : ''}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="admin-form__field">
          <span>Thuật toán đề xuất</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>

        {mode === 'co_bought' && (
          <label className="admin-form__field">
            <span>Sản phẩm nguồn</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              disabled={loadingOptions}
            >
              {loadingOptions ? (
                <option value="">Đang tải danh sách sản phẩm…</option>
              ) : products.length === 0 ? (
                <option value="">Không có sản phẩm</option>
              ) : (
                products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productId} - {p.name}
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        <label className="admin-form__field admin-form__field--sm">
          <span>Giới hạn Top (1-20)</span>
          <input
            type="number"
            min={1}
            max={20}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          />
        </label>

        <div className="admin-form__actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={status.kind === 'loading' || loadingOptions || !customerId}
          >
            {status.kind === 'loading' ? 'Đang truy vấn Graph…' : 'Phân tích Đồ thị'}
          </button>
        </div>
      </form>

      {status.kind === 'error' && (
        <div className="error-text" role="alert">
          Không phân tích được đồ thị: {status.error}
        </div>
      )}

      {data && (
        <div className="admin-graph__layout">
          {/* Top Candidates Table */}
          <div className="admin-graph__items">
            <h3>Top {data.items.length} sản phẩm được đề xuất</h3>
            {data.items.length === 0 ? (
              <p className="muted">Không có ứng viên nào thỏa mãn tiêu chí loại trừ.</p>
            ) : (
              <div className="admin-table__wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã SP</th>
                      <th>Tên sản phẩm</th>
                      <th>Score</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it) => (
                      <tr key={it.productId}>
                        <td><code>{it.productId}</code></td>
                        <td><strong>{it.name}</strong></td>
                        <td><span className="badge badge--purple">{it.score}</span></td>
                        <td><span className="badge badge--primary">{it.support}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SVG Graph View */}
          <div className="admin-graph__graph">
            <h3>Đồ thị trực quan hóa đường đi</h3>
            {data.isPartial && (
              <p className="muted small">
                Đồ thị hiển thị mẫu các nút đại diện; điểm số được tính chính xác trên toàn bộ dữ liệu Neo4j.
              </p>
            )}

            <div className="admin-graph__canvas-wrap">
              <svg
                className="admin-graph__svg"
                viewBox={viewBox.viewBox}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Đồ thị quan hệ gợi ý sản phẩm Neo4j"
              >
                {/* Edges */}
                {data.edges.map((e, idx) => {
                  const s = positions.get(e.source);
                  const t = positions.get(e.target);
                  if (!s || !t) return null;
                  return (
                    <line
                      key={`edge-${idx}`}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={colorForEdge(e.type)}
                      strokeWidth={2}
                      strokeDasharray={e.type === 'VIEWED' ? '4 3' : 'none'}
                      opacity={0.85}
                    />
                  );
                })}

                {/* Nodes */}
                {data.nodes.map((n) => {
                  const p = positions.get(n.id);
                  if (!p) return null;
                  const labelText = n.label && n.label.length > 10 ? `${n.label.slice(0, 9)}…` : (n.label || n.id);
                  return (
                    <g key={n.id} transform={`translate(${p.x}, ${p.y})`} className="graph-node-group">
                      <title>{`${n.label || n.id} (${n.type})`}</title>
                      <circle
                        r={NODE_RADIUS}
                        fill={colorForType(n.type)}
                        stroke="#ffffff"
                        strokeWidth={2.5}
                        filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))"
                      />
                      <text
                        y={4}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#ffffff"
                        style={{ fontWeight: 700, pointerEvents: 'none' }}
                      >
                        {labelText}
                      </text>
                      <text
                        y={NODE_RADIUS + 16}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#334155"
                        style={{ fontWeight: 600, pointerEvents: 'none' }}
                      >
                        {n.type.split(':')[1] || n.type}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <ul className="admin-graph__legend" aria-label="Chú giải đồ thị">
              <li><span className="dot" style={{ background: '#2563eb' }} /> Khách đang xét (Target)</li>
              <li><span className="dot" style={{ background: '#3b82f6' }} /> Khách tương đồng (Peer)</li>
              <li><span className="dot" style={{ background: '#7c3aed' }} /> Sản phẩm chung (Shared)</li>
              <li><span className="dot" style={{ background: '#059669' }} /> Sản phẩm gợi ý (Recommended)</li>
              {mode === 'co_bought' && (
                <li><span className="dot" style={{ background: '#d97706' }} /> Sản phẩm nguồn (Source)</li>
              )}
            </ul>
          </div>

          {/* Contributions Table */}
          <div className="admin-graph__contrib">
            <h3>Đóng góp điểm tương đồng từ Peers</h3>
            {data.contributions.length === 0 ? (
              <p className="muted">Không có người dùng đóng góp tương đồng.</p>
            ) : (
              <div className="admin-table__wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Peer ID</th>
                      <th>Alias ẩn danh</th>
                      <th>Điểm đóng góp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.contributions.map((c, idx) => (
                      <tr key={`${c.peerId}-${idx}`}>
                        <td><code>{c.peerId}</code></td>
                        <td>{c.peerAlias || '—'}</td>
                        <td><strong>{c.contribution}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small">
              Tổng số peers: <strong>{data.sampleSummary.totalPeers}</strong> | Đã hiển thị: <strong>{data.sampleSummary.shownPeers}</strong>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
