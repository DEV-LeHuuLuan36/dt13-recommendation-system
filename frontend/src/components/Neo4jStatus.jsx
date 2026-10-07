import HealthCard from './HealthCard.jsx';

export default function Neo4jStatus({ state }) {
  const detail = state.detail;
  const extra = [];
  if (detail && detail.error && detail.error.code) extra.push(`Ma loi: ${detail.error.code}`);
  if (detail && detail.database) extra.push(`Database: ${detail.database}`);

  const description =
    'Endpoint /api/health/neo4j kiem tra CSDL that qua neo4j-driver. Khi chua cau hinh se hien thi "Chua cau hinh ket noi Neo4j".';

  return (
    <HealthCard
      title="Neo4j (qua driver)"
      description={description}
      state={{ ...state, extra }}
    />
  );
}