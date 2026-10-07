# SETUP_REPORT — Bao cao khoi tao (Giai doan 1)

> Ngay thuc hien: 2026-10-07. Workspace: `D:\DoAn_NoSQL`.
> Giai doan: 1 (Khoi tao). Trang thai cuoi: **`SCAFFOLD_READY`** (phan CSDL that o trang thai `BLOCKED_CONFIGURATION` do chua co mat khau/instance Neo4j).

## 1. Stack da su dung (thuc te, da cai)

| Khoi | Cong nghe | Phien ban (npm ls) |
| --- | --- | --- |
| He dieu hanh | Windows 11, 64-bit, PowerShell | (khong yeu cau pin) |
| Node.js | Da co san, khong nang cap | **v24.15.0** |
| npm | Da co san, khong nang cap | **11.12.1** |
| Git | Da co san | **2.55.0.windows.3** |
| Workspace root | npm workspaces (frontend + backend) | workspaces khai bao trong `package.json` |
| Frontend | React + Vite, JavaScript, `.jsx`/`.js` | `react@18.3.1`, `react-dom@18.3.1`, `vite@6.4.4`, `@vitejs/plugin-react@4.7.0`, `eslint-plugin-react@7.37.5` |
| Backend | Node.js 24, Express ESM | `express@4.22.3`, `dotenv@16.6.1`, `express-session@1.19.0`, `neo4j-driver@5.28.3` |
| Tooling | ESLint 9, supertest, concurrently | `eslint@9.39.5`, `supertest@7.3.1`, `concurrently@9.2.4` |

Khoa them: chua cai Docker, TypeScript, framework test khac (Thai - dung `node:test` cua Node 24).

## 2. Cau truc da tao

```
D:\DoAn_NoSQL\
├── package.json                 # workspaces + scripts (dev, lint, build, test, check:neo4j)
├── package-lock.json            # lockfile duy nhat, 374 packages
├── .gitignore                   # ignore node_modules, dist, .env that
├── AGENTS.md                    # huong dan ngan cho agent va nguoi moi
├── README.md                    # huong dan chay + cau hinh Neo4j Desktop
├── TASKS.md                     # checklist cac giai doan
├── MASTER_CONTEXT.md            # giu nguyen tai root
├── docs\
│   ├── GRAPH_MODEL.md           # tom tat muc 5-6 (thiet ke, chua nap du lieu)
│   └── SETUP_REPORT.md          # file nay
├── backend\                     # workspace @dt13/backend
│   ├── package.json
│   ├── eslint.config.js
│   ├── .env.example             # mau, khong secret
│   ├── .env                     # local, NEO4J_PASSWORD de trong, SESSION_SECRET ngau nhien
│   ├── .gitignore               # ignore node_modules, .env
│   ├── src\
│   │   ├── app.js               # tao Express app (de test su dung)
│   │   ├── server.js            # bind cong, signal shutdown
│   │   ├── config.js            # load env, parse .env, loadConfig()
│   │   ├── neo4j.js             # createNeo4jClient() + createFakeNeo4jClient()
│   │   ├── middleware\error.js  # 404 JSON + errorHandler thong nhat
│   │   └── routes\health.js     # GET /api/health va /api/health/neo4j
│   ├── scripts\check-neo4j.js   # `npm run check:neo4j`
│   └── test\
│       ├── health.test.js       # 6 ca supertest
│       ├── config.test.js       # 4 ca loadConfig/sanitizeError
│       └── fixtures-env\.env   # test fixture
└── frontend\                    # workspace @dt13/frontend
    ├── package.json
    ├── eslint.config.js
    ├── vite.config.js           # bind 127.0.0.1:5173 strictPort + proxy /api
    ├── index.html               # tieng Viet, UTF-8
    ├── .env.example
    ├── .env                     # local public (VITE_*)
    ├── .gitignore
    └── src\
        ├── main.jsx
        ├── App.jsx              # trang kiem tra ket noi
        ├── api\health.js        # fetch /api/health, /api/health/neo4j
        ├── components\
        │   ├── HealthCard.jsx
        │   ├── Neo4jStatus.jsx
        │   └── StatusBadge.jsx
        └── styles\
            ├── global.css
            └── App.css
```

## 3. Scripts root (da dat nghia thuc)

- `npm run dev`: chay dong thoi backend + frontend qua `concurrently -k -n backend,frontend`. Hien thi log theo prefix.
- `npm run dev:backend`: chi chay backend (Express, `--watch`).
- `npm run dev:frontend`: chi chay frontend (Vite).
- `npm run build`: build frontend (`vite build`), output `frontend/dist`.
- `npm run lint`: `npm --workspace frontend run lint && npm --workspace backend run lint`. Backend khong am tham bo qua.
- `npm test`: chay `node --test` cac file `test/**/*.test.js` o workspace backend.
- `npm run check:neo4j`: chay `scripts/check-neo4j.js` o backend, exit code phan anh that:
  - `0` = ket noi thanh cong.
  - `2` = thieu config.
  - `3` = loi ket noi.
  - `4` = loi khac.

## 4. Cau hinh env

- `backend/.env.example`: mau, khong co mat khau that, khong co secret.
- `backend/.env` (da tao): `NEO4J_PASSWORD=""`, cac truong khac theo mac dinh. `SESSION_SECRET` duoc sinh bang `node:crypto` (48 bytes base64url) tai luc tao file; **gia tri khong ghi trong report nay**.
- `frontend/.env.example` va `frontend/.env`: cong khai (`VITE_DEV_PORT=5173`, `VITE_API_PROXY_TARGET=http://127.0.0.1:3001`).
- Cả 2 file `.env` that da duoc `.gitignore` ignore; git `check-ignore -v` xac nhan.

## 5. Health endpoints (Giai doan 1)

- `GET /api/health`: 200, body `{ "status":"ok", "service":"dt13-api", "uptime":..., "timestamp":"..." }`. Khong chua password, session secret hay env.
- `GET /api/health/neo4j`:
  - Khong co `neo4jClient` (thieu NEO4J_PASSWORD hoac truong khac): 503, `error.code = "NEO4J_NOT_CONFIGURED"`.
  - Co client nhung `ping()` that bai (sai mat khau, instance chua chay, sai database): 503, `error.code = "NEO4J_UNAVAILABLE"`; message duoc loc bo `password=...`, `"password":"..."` qua `sanitizeError()`.
  - Ping thanh cong: 200, `status: "connected"`.
- Co timeout 4s cho ping; backend bind `127.0.0.1:3001`.
- Express-session da wire (cookie name `dt13.sid`, httpOnly, sameSite lax, maxAge 8h); giai doan 1 chua dang nhap. MemoryStore duoc ghi ro trong code la chi-cho-demo-local.

## 6. Frontend trang kiem tra

- Tai `/`: render trang kiem tra gom header mo ta, hai HeatCard (API + Neo4j), nut "Kiem tra lai" voi aria-busy, footer.
- Polling 15s co the tat/bat.
- Khong co so lieu gia (so san pham, so khach, diem goi y).
- Vite proxy `/api` den `http://127.0.0.1:3001` (`changeOrigin: true`).
- Bind `127.0.0.1:5173`, `strictPort: true`.
- Responsive, tieng Viet co dau, UTF-8 (file HTML co `<meta charset="UTF-8" />`, `<html lang="vi">`).

## 7. Git local

- Repo khoi tao tai `D:\DoAn_NoSQL\.git`, branch `main`.
- Commit `fca5e2b` (root-commit): "Giai doan 1: khoi tao workspace dt13-recommendation-system" - 35 file.
- `user.name`/`user.email` chi dat cho commit nay qua `git -c user.name=... -c user.email=...` (khong doi git config global).
- `.env` that cua backend va frontend khong xuat hien trong `git status` hay `git ls-files`. `git status --ignored` chi ra `!! backend/.env` va `!! frontend/.env`.
- Khong tao remote; khong push.

## 8. Ket qua kiem tra (PASS/FAIL/BLOCKED/NOT_CHECKED)

| Kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| `node -v`, `npm -v`, `git --version` | PASS | 24.15.0 / 11.12.1 / 2.55.0 |
| `npm install` (root) | PASS | 374 packages; co warning `eslint@9.39.5 deprecated` (ESLint 9.39.x khong con duoc ho tro; se cap nhat o giai doan tiep). |
| `npm run lint` | PASS | Frontend va backend deu PASS (max-warnings 0). |
| `npm run build` (frontend) | PASS | 32 modules, `dist/assets/index-*.js` 148 kB (gzip 47.91 kB). |
| `npm test` (backend) | PASS | 10/10: `health.test.js` (6 ca), `config.test.js` (4 ca). |
| `npm run check:neo4j` (chay thuc) | BLOCKED_CONFIGURATION | Exit 2 vi `NEO4J_PASSWORD=""`. Ly do chinh: nguoi dung chua dat mat khau va instance Neo4j chua khoi chay (xem muc 9). |
| `GET /api/health` (live) | PASS | 200, body khong co `password`/`SECRET`. |
| `GET /api/health/neo4j` (live) | BLOCKED_CONFIGURATION | 503 `NEO4J_NOT_CONFIGURED` (phan anh dung trang thai). |
| Vite dev server (`http://127.0.0.1:5173/`) | PASS | 200, HTML tieng Viet, proxy `/api/*` den backend OK. |
| Frontend `src/main.jsx`, `src/App.jsx` qua Vite | PASS | 200 (Vite transform JSX thanh module). |
| Git init + `.env` ignore | PASS | `git check-ignore -v` xac nhan 2 file `.env` bi ignore. |
| Kiem tra UI bang browser visual (Playwright/chrome) | NOT_CHECKED | Khong co browser tool su dung trong luot nay; chi kiem tra HTTP va HTML. Theo 8.8: ghi ro la chua kiem tra truc quan. |

### Loi phat hien trong qua trinh va da sua

1. Frontend: `MESSAGE` khong su dung trong `Neo4jStatus.jsx` → da xoa.
2. Backend: `neo4j` import khong su dung trong `routes/health.js` → da bo import.
3. Backend: tham so `next` khong su dung trong handler → da bo.
4. Backend: cac `eslint-disable no-console` khong can (rule da `off`) → da bo.
5. Backend: `sanitizeError` chua loc password/secret trong message → da them regex che `password=...`, `"password":"..."`, `neo4j password ...`; test cap nhat de xac nhan.
6. Backend script: `node --test test` (folder) Node 24 yeu cau glob → da doi thanh `node --test "test/**/*.test.js"`.

## 9. Phan con thieu (can nguoi dung thuc hien)

- **Mat khau Neo4j**: trong `backend/.env`, dat `NEO4J_PASSWORD` thanh mat khau da tao trong Neo4j Desktop.
- **Instance Neo4j Desktop**:
  - Mo Neo4j Desktop, tao project (vi du "DT13").
  - Tao DBMS rieng cho de tai (vi du ten "DT13"), dat mat khau neu chua co.
  - Start DBMS. URI mac dinh: `bolt://127.0.0.1:7687`. Username mac din: `neo4j`. Database mac din: `neo4j`.
  - Dien cac gia tri vao `backend/.env` (URI, USERNAME, PASSWORD, DATABASE). Khong gui mat khau vao chat/report.
- **Repository GitHub**: chua co remote cu the. Tai khoan `DEV-LeHuuLuan36` (https://github.com/DEV-LeHuuLuan36) la URL trang ca nhan, khong phai remote. Sau khi co URL repo (vd `https://github.com/DEV-LeHuuLuan36/DT13-Recommendation-System.git`), them bang `git remote add origin <URL>`.
- **Khi nao CSDL that dat**: `npm run check:neo4j` se doi exit code tu 2 sang 0, va `/api/health/neo4j` se tra 200. Trang thai chuyen tu `BLOCKED_CONFIGURATION` sang `NEO4J_CONNECTED`.

## 10. URL va lenh chay (tu `D:\DoAn_NoSQL`)

- `npm install` (cai dat mot lan; `npm.cmd` neu PowerShell chan).
- `npm run dev` — backend `http://127.0.0.1:3001`, frontend `http://127.0.0.1:5173`.
- Ctrl+C de dung ca hai khi `npm run dev`.
- Kiem tra don le: `npm run lint`, `npm run build`, `npm test`, `npm run check:neo4j`.

## 11. Trang thai tong ket

- Trang thai Giai doan 1: **`SCAFFOLD_READY`** — dependencies, lint, build, test va chay frontend/backend da dat. Phan CSDL that con o `BLOCKED_CONFIGURATION` do mat khau/instance chua co (khong phai loi cua scaffold).
- Buoc tiep theo (Giai doan 2): schema/constraints, seed, dang nhap + phan quyen khi moi truong Neo4j da san sang.

## 12. Ghi chu ky thuat khong lo

- ESLint 9.39.5 dang deprecated nhung van PASS. Khong dung `npm audit fix --force`; se cap nhat o mot dot rieng neu can.
- Frontend dependencies dat o `node_modules` cua root (npm workspaces), khong o `frontend/node_modules`. `npm --workspace frontend run <script>` van chay dung.
- Backend bind `127.0.0.1:3001` strict; neu muon test HTTPS hay cong khac, cap nhat `backend/.env`, `frontend/.env`, `frontend/vite.config.js` dong bo truoc khi chay.
- Khong ghi de `.env` that cua nguoi dung; cac file `.env` da tao boi agent de trong `NEO4J_PASSWORD`.
- Bao cao nay khong chua mat khau, session secret hay token.