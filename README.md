# DT13 — Recommendation System (Neo4j)

He thong goi y san pham tuong quan su dung Neo4j — De tai 13 mon NoSQL.

Tai lieu nay chi mo ta buoc **khoi tao (Giai doan 1)** cua de tai: monorepo npm, backend Express, frontend React/Vite, ket noi Neo4j qua driver, hai health endpoint va trang kiem tra ket noi.

## Yeu cau moi truong

- Node.js >= 20 (da kiem tra: v24.15.0)
- npm >= 10 (da kiem tra: 11.12.1)
- Neo4j Desktop (de chay instance cuc bo)
- Windows 10/11, PowerShell 7+ (hoac cmd). Neu PowerShell chan `npm.ps1`, dung `npm.cmd` / `npx.cmd`.

## Cai dat

Tai thu muc goc `D:\DoAn_NoSQL`:

```powershell
npm install
```

Hoac neu PowerShell chan script:

```cmd
npm.cmd install
```

## Cau hinh env

Sao chep cac file mau va dien gia tri that (khong commit file `.env`):

- `backend/.env.example` → `backend/.env`
  - `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`
  - `SESSION_SECRET`: chuoi ngau nhien (agent sinh khi tao `.env` local)
- `frontend/.env.example` → `frontend/.env` (neu can thay cong)
  - `VITE_DEV_PORT`, `VITE_API_PROXY_TARGET`

## Chay dev

```powershell
npm run dev
```

- Backend: `http://127.0.0.1:3001`
- Frontend: `http://127.0.0.1:5173`

Frontend goi API tuong doi `/api/...` qua Vite proxy den backend.

## Neo4j Desktop

1. Mo Neo4j Desktop, tao mot project (vi du: "DT13").
2. Tao mot DBMS rieng cho de tai (vi du ten "DT13"), dat mat khau.
3. Start DBMS, lay URI/Username/Database (thuong mac dinh `bolt://127.0.0.1:7687`, `neo4j`, database `neo4j`).
4. Dien cac gia tri vao `backend/.env`. **Ten instance** (DT13) khac voi **ten database** (mac dinh `neo4j`).

Luu y:
- Ten instance (VD: DT13) la ten DBMS trong Neo4j Desktop, dung de quan ly.
- Ten database (VD: neo4j) la ten CSDL ben trong DBMS, dung cho `NEO4J_DATABASE`.
- URL tai khoan GitHub `https://github.com/DEV-LeHuuLuan36` chua phai remote cua repo nay. Can tao repo tren GitHub truoc khi them remote.

## Lệnh kiem tra

```powershell
npm run lint         # lint frontend + backend
npm run build        # build frontend (Vite)
npm test             # kiem thu backend (node:test + supertest)
npm run check:neo4j  # kiem tra ket noi CSDL that
```

## Health endpoints (Giai doan 1)

- `GET /api/health` — Express dang chay. Tra `200` voi `{ "status": "ok", "service": "dt13-api" }`. Khong chua secrets.
- `GET /api/health/neo4j` — kiem tra CSDL that.
  - `200` khi truy van `RETURN 1` thanh cong.
  - `503` `NEO4J_NOT_CONFIGURED` khi thieu `NEO4J_PASSWORD`.
  - `503` `NEO4J_UNAVAILABLE` khi CSDL khong truy cap duoc (sai mat khau, instance dung, sai database...).

## Trang kiem tra (frontend)

`/` la trang kiem tra ket noi cua de tai:
- Trang thai API (lay tu `/api/health`).
- Trang thai Neo4j (lay tu `/api/health/neo4j`).
- Nut "Kiem tra lai" de refresh.

Trang nay khong co so lieu gia (so san pham, so khach, diem goi y). No chi la buoc kiem tra cho khoi tao.

## Cau truc

```
.
├── package.json
├── package-lock.json
├── .gitignore
├── AGENTS.md
├── README.md
├── TASKS.md
├── MASTER_CONTEXT.md
├── docs/
│   ├── SETUP_REPORT.md
│   └── GRAPH_MODEL.md
├── frontend/   # React/Vite, @dt13/frontend
└── backend/    # Express ESM, @dt13/backend
```

## Dieu khien hanh vi

- Khi gap loi, sua nguyen nhan roi chay lai kiem tra bi anh huong.
- Khong tu khoi dong DBMS khac, khong doi mat khau Neo4j, khong doan mat khau tu credential cua may.
- Khi chua co mat khau/instance, cac kiem tra CSDL that o trang thai `BLOCKED_CONFIGURATION`, cac phan con lai van dat neu dat yeu cau.