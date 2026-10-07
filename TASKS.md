# TASKS.md — Checklist cac giai doan

Trang thai checklist theo MASTER_CONTEXT.md. Chi danh dau hoan thanh khi da thuc su chay kiem tra va dat yeu cau.

## Giai doan 1 — Khoi tao du an

- [x] Kiem tra workspace `D:\DoAn_NoSQL`; doc MASTER_CONTEXT.md; AGENTS.md, README, TASKS.
- [x] Kiem tra `node -v`, `npm -v`, `git --version` va ghi vao SETUP_REPORT.
- [x] Tao `package.json` root voi npm workspaces (frontend, backend) va scripts.
- [x] Tao `.gitignore`, `AGENTS.md`, `README.md`, `TASKS.md`.
- [x] Tao `backend/` (Express ESM, app/server tach, config, neo4j driver, health routes, error middleware).
- [x] Tao `frontend/` (Vite React, trang kiem tra ket noi, proxy `/api`).
- [x] Tao `docs/SETUP_REPORT.md`, `docs/GRAPH_MODEL.md`.
- [x] Tao file `.env.example` cho frontend/backend; sinh `.env` local backend voi `SESSION_SECRET` (khong in ra report).
- [x] Cai dat dependencies (`npm install`) tu root, ghi lockfile.
- [x] Cau hinh ESLint cho frontend va backend.
- [x] Tao `scripts/check-neo4j.js` o backend.
- [x] Viet kiem thu `node:test` + `supertest` cho health (bao gom truong hop thieu config va failure).
- [x] `npm run lint` — PASS.
- [x] `npm run build` (frontend) — PASS.
- [x] `npm test` (backend) — PASS.
- [x] Chay `npm run dev` that: backend `127.0.0.1:3001`, frontend `127.0.0.1:5173`.
- [x] `GET /api/health` tra 200, khong chua secrets.
- [x] `GET /api/health/neo4j` phan anh dung trang thai (503 khi thieu password/instance chua chay).
- [x] Khoi tao Git local (neu Git co san); `.env` that khong bi theo doi; commit initial.
- [x] Trang kiem tra frontend tai `/` tai thanh cong; fetch qua proxy; khong nut trong console da quan sat.

## Giai doan 2 — Schema, seed, dang nhap, phan quyen (CHUA THUC HIEN)

- [ ] Tao constraints va index theo thiet ke (Customer.email, Product.productId, Category.categoryId, BOUGHT/VIEWED.eventId).
- [ ] Seed 100+ san pham, 50+ khach (role=customer), 1 admin, 6 danh muc, 260 BOUGHT + 180 VIEWED; idempotent.
- [ ] POST `/api/auth/login`, `/api/auth/logout`, GET `/api/auth/me`; bam bang `node:crypto` scrypt; phiên cookie express-session.
- [ ] Phan quyen: admin CRUD quan tri; customer moi moi/xem/lich su/goi y cua minh.

## Giai doan 3 — CRUD, mua/xem, lich su (CHUA THUC HIEN)

- [ ] CRUD `/api/products`, `/api/categories`, `/api/customers` theo hop dong.
- [ ] POST `/api/interactions/views` va `/api/post`.
- [ ] GET `/api/me/history` (phan trang).
- [ ] Bao ve lich su (409, fallback `active=false`).
- [ ] Idempotency theo `eventId`.

## Giai doan 4 — Go i y Cypher va API goi y (CHUA THUC HIEN)

- [ ] `/api/recommendations/me` (ca nhan hoa) theo cong thuc 6.1.
- [ ] `/api/recommendations/products/:productId` (mua cung) theo cong thuc 6.2.
- [ ] Dung do thi nho o muc 6.3 doi khop.
- [ ] Khử trung, loai hang da mua, fallback cho nguoi chua mua.
- [ ] `/api/analytics/graph-stats`.

## Giai doan 5 — Tich hop giao dien, EXPLAIN/PROFILE, demo (CHUA THUC HIEN)

- [ ] Frontend danh sach san pham, chi tiet san pham, lich su, goi y; trang admin CRUD.
- [ ] Ghi EXPLAIN/PROFILE cho cac truy van goi y.
- [ ] Kich ban demo, anh, so lieu that.