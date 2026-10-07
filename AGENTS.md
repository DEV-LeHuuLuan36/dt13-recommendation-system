# AGENTS.md — Huong dan ngan cho repository

Tai lieu nay tom tat cac quy tac lam viec trong workspace `D:\DoAn_NoSQL` cho cac agent AI va nguoi moi tham gia.

## 1. Ngu canh

- Workspace goc: `D:\DoAn_NoSQL` (khong tao them thu muc long).
- De tai: "He thong goi y san pham tuong quan su dung Neo4j" (De tai 13 - mon NoSQL).
- De cuong chi tiet va cac quyet dinh ky thuat duoc ghi trong `MASTER_CONTEXT.md` (tai root). Khong doi ngu canh o trong file su dung 2.
- Tien do checklist o `TASKS.md`.
- Trang thai khoi tao that: `docs/SETUP_REPORT.md`.
- Thiet ke do thi (chua nap du lieu): `docs/GRAPH_MODEL.md`.

## 2. Stack da chot

| Khoi | Cong nghe |
| --- | --- |
| Frontend | React + Vite, JavaScript, file `.jsx` / `.js` |
| Backend | Node.js 24, Express, ES Modules (`"type": "module"`) |
| CSDL | Neo4j (chay cuc bo qua Neo4j Desktop), driver `neo4j-driver` |
| Workspace | npm workspaces, mot repo, hai workspace `frontend/` va `backend/` |
| UI | CSS thuan, tieng Viet co dau, responsive laptop va dien thoai |

Khong chuyen sang TypeScript, khong them Docker, CSDL thu hai, dich vu LLM hay framework test lon.

## 3. Cau truc

```
.
├── package.json              # workspaces, scripts root
├── package-lock.json
├── .gitignore
├── AGENTS.md
├── README.md
├── TASKS.md
├── MASTER_CONTEXT.md
├── docs/
│   ├── SETUP_REPORT.md
│   └── GRAPH_MODEL.md
├── frontend/               # @dt13/frontend — Vite
└── backend/                # @dt13/backend  — Express ESM
```

## 4. Lenh chay chuan (tu `D:\DoAn_NoSQL`)

- `npm install` — cai dat dependencies cua ca hai workspace.
- `npm run dev` — chay dong thoi backend (3001) va frontend (5173).
- `npm run dev:backend` / `npm run dev:frontend` — chay rieng tung phan.
- `npm run build` — build frontend (Vite).
- `npm run lint` — lint ca frontend va backend (Backend ca lint function hon, khong am tham bo qua).
- `npm test` — chay kiem thu backend (node:test + supertest).
- `npm run check:neo4j` — kiem tra ket noi CSDL that; exit code phan anh that.

Luu y tren Windows PowerShell: neu `npm.ps1` bi chan, dung `npm.cmd` va `npx.cmd`.

## 5. Bien so thi backend

Tao `backend/.env` (sao chep tu `backend/.env.example`). Khong commit file `.env` that.

- `NODE_ENV`: development | production
- `HOST`: 127.0.0.1
- `PORT`: 3001
- `NEO4J_URI`: vi du `bolt://127.0.0.1:7687`
- `NEO4J_USERNAME`: vi du `neo4j`
- `NEO4J_PASSWORD`: mat khau do nguoi dung dat trong Neo4j Desktop; KHONG in/luu/report.
- `NEO4J_DATABASE`: mac dinh `neo4j`
- `SESSION_SECRET`: chuoi ngau nhien, sinh bang `node:crypto` (agent) khi tao `.env` local.

## 6. Pham vi va ranh gioi

- Frontend chi doc config oke ca (Vite); khong duoc doc `.env` backend, khong chua `neo4j-driver`, khong chua NEO4J_PASSWORD/SESSION_SECRET.
- React goi API tuong doi `/api/...`, Vite proxy den backend (cau hinh trong `frontend/vite.config.js`).
- Backend chi bind `127.0.0.1` trong giai doan local. Khi doi cong, dong bo `.env`, `vite.config.js`, frontend `.env` truoc khi kiem tra.
- Backend co the khoi dong khi thieu NEO4J_PASSWORD; health endpoint se tra 503 voi ma `NEO4J_NOT_CONFIGURED`.
- Trang khoi tao frontend (khoi tao du an) chi la trang kiem tra ket noi, khong co du lieu gia (so san pham, so khach, diem goi y).

## 7. Bi mat va secrets

- KHONG in mat khau Neo4j, token, SESSION_SECRET secret ra chat, REPORT sau hoac Git.
- KHONG su dung `npm audit fix --force` de tu chuyen phien nghien lon.
- KHONG tu tao repository GitHub, commit, push trong Giai doan 1.
- KHONG ghi de `.env` that cua nguoi dung da co noi dung; chi dien neu file moi.

## 8. Dieu khien hanh vi

- Khi gap loi, sua nguyen nhan roi chay lai kiem tra bi anh huong.
- Khi co lua chon chua chot trong MASTER_CONTEXT.md, theo huong don gian, de hoc, de bao tri; neu khong, ghi quyet dinh vao SETUP_REPORT.md.
- Khi bao cao, ghi PASS/FAIL/BLOCKED/NOT_CHECKED theo thuc te, kem nguyen nhan cu the.