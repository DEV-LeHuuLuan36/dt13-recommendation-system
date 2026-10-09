import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import '../../styles/AdminCrud.css';
import '../../styles/RecommendationGraph.css';

const MODES = [
  { key: 'user_cf', label: 'CF cá nhân (user_cf)' },
  { key: 'co_bought', label: 'Mua cùng (co_bought)' },
];

const NODE_RADIUS = 28;
const CANVAS_W = 720;
const CANVAS_H = 460;

// Layout rules:
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
    positions.set(source.id, { x: CANVAS_W / 2, y: 70 });
  }
  const peerR = 150;
  peers.forEach((p, i) => {
    const ang = (Math.PI * 2 * i) / Math.max(peers.length, 1);
    positions.set(p.id, {
      x: CANVAS_W / 2 + Math.cos(ang) * peerR,
      y: CANVAS_H / 2 + Math.sin(ang) * peerR,
    });
  });
  const itemR = 200;
  items.forEach((p, i) => {
    const ang = Math.PI + (Math.PI * (i + 1)) / Math.max(items.length + 1, 1);
    positions.set(p.id, {
      x: CANVAS_W / 2 + Math.cos(ang) * itemR,
      y: CANVAS_H / 2 + Math.sin(ang) * itemR,
    });
  });
  const sharedR = 70;
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
  if (type === 'customer:target') return '#0b5fff';
  if (type === 'customer:peer') return '#5b8def';
  if (type === 'product:source') return '#d97706';
  if (type === 'product:item') return '#16a34a';
  if (type === 'product:shared') return '#a855f7';
  return '#6b7280';
}

function colorForEdge(type) {
  if (type === 'BOUGHT') return '#94a3b8';
  if (type === 'VIEWED') return '#fbbf24';
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
  const pad = 60;
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
  const requestSeq = useRef(0);

  useEffect(() => {
    api.listCustomers({ pageSize: 100 })
      .then((d) => {
        const items = (d.items || []).filter((c) => c.role === 'customer');
        setCustomers(items);
        if (items[0]) setCustomerId((cur) => cur || items[0].customerId);
      })
      .catch((err) => setStatus({ kind: 'error', error: err.message }));
    api.listProducts({ pageSize: 100, includeInactive: false })
      .then((d) => {
        setProducts(d.items || []);
        if (d.items && d.items[0]) setProductId((cur) => cur || d.items[0].productId);
      })
      .catch(() => {});
  }, []);

  const run = useCallback(async () => {
    if (!customerId) return;
    if (mode === 'co_bought' && !productId) {
      setStatus({ kind: 'error', error: 'Vui lòng chọn sản phẩm nguồn cho co_bought.' });
      return;
    }
    const seq = ++requestSeq.current;
    setStatus({ kind: 'loading', error: null });
    try {
      const params = { customerId, mode, limit };
      if (mode === 'co_bought') params.productId = productId;
      const res = await api.recommendationGraph(params);
      if (seq !== requestSeq.current) return;
      setData(res);
      setStatus({ kind: 'ready', error: null });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setData(null);
      setStatus({ kind: 'error', error: err.message });
    }
  }, [customerId, mode, productId, limit]);

  useEffect(() => {
    if (customerId) run();
    return () => { requestSeq.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positions = useMemo(() => layoutNodes(data?.nodes || []), [data]);
  const viewBox = useMemo(() => fitView(data?.nodes || [], positions), [data, positions]);

  return (
    <section className="admin-crud admin-graph" aria-label="Phân tích gợi ý">
      <header className="admin-crud__header">
        <h2>Phân tích gợi ý</h2>
      </header>

      <form
        className="admin-form admin-graph__form"
        onSubmit={(e) => { e.preventDefault(); run(); }}
      >
        <label>
          <span>Khách hàng</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            {customers.map((c) => (
              <option key={c.customerId} value={c.customerId}>
                {c.customerId} - {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Phương pháp</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        {mode === 'co_bought' && (
          <label>
            <span>Sản phẩm nguồn</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.productId} - {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Giới hạn (1-20)</span>
          <input
            type="number"
            min={1}
            max={20}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          />
        </label>
        <div className="admin-form__actions">
          <button type="submit" className="btn-primary" disabled={status.kind === 'loading'}>
            {status.kind === 'loading' ? 'Đang phân tích…' : 'Phân tích'}
          </button>
        </div>
      </form>

      {status.kind === 'error' && <p className="error-text">Không tải được phân tích. Vui lòng thử lại.</p>}

      {data && (
        <div className="admin-graph__layout">
          <div className="admin-graph__items">
            <h3>Top {data.items.length} ứng viên</h3>
            {data.items.length === 0 ? (
              <p className="muted">Không có ứng viên.</p>
            ) : (
              <div className="admin-table__wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Tên</th>
                      <th>Score</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it) => (
                      <tr key={it.productId}>
                        <td><code>{it.productId}</code></td>
                        <td>{it.name}</td>
                        <td>{it.score}</td>
                        <td>{it.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-graph__graph">
            <h3>Đồ thị minh họa</h3>
            {data.isPartial && (
              <p className="muted">
                Đồ thị hiển thị một phần quan hệ; điểm được tính trên toàn bộ dữ liệu.
              </p>
            )}
            <svg
              className="admin-graph__svg"
              viewBox={viewBox.viewBox}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="Đồ thị gợi ý"
            >
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
                    strokeWidth={1.5}
                    opacity={0.8}
                  />
                );
              })}
              {data.nodes.map((n) => {
                const p = positions.get(n.id);
                if (!p) return null;
                return (
                  <g key={n.id} transform={`translate(${p.x}, ${p.y})`}>
                    <circle r={NODE_RADIUS} fill={colorForType(n.type)} stroke="#fff" strokeWidth={2} />
                    <text
                      y={4}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#fff"
                      style={{ fontWeight: 600 }}
                    >
                      {n.label.length > 9 ? `${n.label.slice(0, 8)}…` : n.label}
                    </text>
                    <text
                      y={NODE_RADIUS + 14}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#475569"
                    >
                      {n.type}
                    </text>
                  </g>
                );
              })}
            </svg>
            <ul className="admin-graph__legend">
              <li><span className="dot" style={{ background: '#0b5fff' }} /> Khách đang phân tích</li>
              <li><span className="dot" style={{ background: '#5b8def' }} /> Người mua (peer)</li>
              <li><span className="dot" style={{ background: '#d97706' }} /> Sản phẩm nguồn (co_bought)</li>
              <li><span className="dot" style={{ background: '#16a34a' }} /> Ứng viên (item)</li>
              <li><span className="dot" style={{ background: '#a855f7' }} /> Sản phẩm chung (CF)</li>
            </ul>
          </div>

          <div className="admin-graph__contrib">
            <h3>Đóng góp điểm</h3>
            {data.contributions.length === 0 ? (
              <p className="muted">Không có peer đóng góp.</p>
            ) : (
              <div className="admin-table__wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Peer alias</th>
                      <th>Peer id</th>
                      <th>Đóng góp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.contributions.map((c, idx) => (
                      <tr key={`${c.peerId}-${idx}`}>
                        <td>{c.peerAlias || '-'}</td>
                        <td><code>{c.peerId}</code></td>
                        <td>{c.contribution}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted">
              Tổng peer: {data.sampleSummary.totalPeers} - Hiển thị: {data.sampleSummary.shownPeers}
              {data.sampleSummary.trimmedPeers > 0 && ` - Bị cắt: ${data.sampleSummary.trimmedPeers}`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
