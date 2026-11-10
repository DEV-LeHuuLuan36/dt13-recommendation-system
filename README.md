# ĐỒ ÁN MÔN HỌC: DỮ LIỆU NOSQL (ĐỀ TÀI 13)
# HỆ THỐNG GỢI Ý SẢN PHẨM TƯƠNG QUAN TRÊN CSDL ĐỒ THỊ NEO4J
### (E-Commerce Product Recommendation System on Neo4j Graph Database)

---

## 📌 THÔNG TIN ĐỒ ÁN & THÀNH VIÊN
- **Cơ sở đào tạo:** Trường Đại học Công Thương TP. Hồ Chí Minh (HUIT)
- **Khoa:** Công nghệ Thông tin
- **Môn học:** Dữ liệu NoSQL
- **Giảng viên hướng dẫn:** TS. Trần Quang Bình
- **Nhóm sinh viên thực hiện:**
  1. **Lê Hữu Luân** – MSSV: `2001230482` (*Trưởng nhóm*)
  2. **Nguyễn Kiều Hạnh Nguyên** – MSSV: `2001230588`
  3. **Nguyễn Anh Tuấn** – MSSV: `2001230847`
- **Link GitHub Repository:** [https://github.com/DEV-LeHuuLuan36/dt13-recommendation-system](https://github.com/DEV-LeHuuLuan36/dt13-recommendation-system)
- **Nhánh chính:** `main`

---

## 🌟 GIỚI THIỆU TỔNG QUAN
Hệ thống là giải pháp sàn thương mại điện tử tích hợp công nghệ **Cơ sở dữ liệu đồ thị Neo4j**, giải quyết bài toán gợi ý sản phẩm tương quan (Recommendation System) theo thời gian thực với độ trễ thấp và độ chính xác cao:

- **Mô hình dữ liệu đồ thị:** 
  - Nút: `:Customer`, `:Product`, `:Category`, `:GuestSession`, `:SearchEvent`
  - Cạnh quan hệ: `[:BELONGS_TO]`, `[:BOUGHT]`, `[:VIEWED]`, `[:IMPRESSED]`, `[:SEARCHED]`
- **Bộ dữ liệu chuẩn:**
  - 120 Sản phẩm công nghệ thực tế (Laptop, Điện thoại, Tai nghe, Đồng hồ, Tablet, Phụ kiện)
  - 60 Khách hàng đa dạng nhóm hành vi
  - Hơn 700 quan hệ hành vi (`BOUGHT` + `VIEWED`), đáp ứng vượt định mức barem đánh giá (> 300 cạnh).
- **Thuật toán gợi ý kết hợp (Hybrid Engine):**
  - **Lọc cộng tác (Collaborative Filtering):** Truy vấn đường đi `(c1)-[:BOUGHT]->(p1)<-[:BOUGHT]-(c2)-[:BOUGHT]->(p2)` với trọng số hành vi: Mua hàng x3.0, Xem sản phẩm x1.0.
  - **Lọc theo nội dung & ngữ cảnh (Content-based):** Gợi ý cùng phân khúc giá và cùng danh mục sản phẩm.
  - **Xử lý Cold-Start (Người dùng mới):** Fallback tự động sang sản phẩm bán chạy nhất (Best-sellers) và sản phẩm được quan tâm nhiều nhất.
  - **Khám phá bất ngờ (Serendipity):** Đa dạng hóa danh sách đề xuất, tránh hiệu ứng "bong bóng lọc".
  - **Bộ phân tích ý định tìm kiếm tiếng Việt (Search Intent Parser):** Nhận diện từ khóa ngữ nghĩa, phân khúc ngân sách (ví dụ: *"laptop đồ họa dưới 20 triệu"*).

---

## 🛠️ CÔNG NGHỆ SỬ DỤNG
- **Database:** Neo4j Enterprise (Cypher Query Language 5.x)
- **Backend:** Node.js (v20+ / v22), Express.js, `neo4j-driver`, mã hóa mật khẩu `scrypt` kèm Salt độc lập cho từng tài khoản.
- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, giao diện chuẩn Responsive Mobile/Desktop hiện đại.
- **Kiểm thử tự động:** Node Test Runner (130+ kiểm thử đơn vị & tích hợp đạt 100% PASS).

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY HỆ THỐNG

### 1. Yêu cầu môi trường
- **Node.js:** Phiên bản `>= 20.0.0`
- **Neo4j:** Cài đặt Neo4j Desktop hoặc Docker, tạo DBMS và khởi động dịch vụ (mặc định cổng Bolt `7687`).

### 2. Cài đặt thư viện dependencies
Tại thư mục gốc dự án, chạy lệnh:
```bash
npm install
```

### 3. Cấu hình biến môi trường
File cấu hình mẫu đã được tạo sẵn tại `backend/.env`:
```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3001

NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=12345678
NEO4J_DATABASE=neo4j

SESSION_SECRET=dt13_super_secret_session_key_2026_dev
```
*(Nếu mật khẩu Neo4j của bạn khác `12345678`, vui lòng sửa lại tương ứng).*

### 4. Khởi tạo CSDL & Nạp dữ liệu mẫu
Chạy lần lượt 2 lệnh sau từ thư mục gốc:
```bash
# 1. Tạo ràng buộc toàn vẹn duy nhất và chỉ mục
npm run db:schema

# 2. Nạp toàn bộ 120 sản phẩm, 60 khách hàng và lịch sử hành vi
npm run db:seed:reference
```

*(Hoặc import trực tiếp file Cypher dump có sẵn trong thư mục `database/dt13_full_database_dump.cypher`).*

### 5. Khởi chạy toàn bộ hệ thống
Chạy lệnh khởi động đồng thời cả Frontend và Backend:
```bash
npm run dev
```

- **Frontend (Giao diện mua sắm & demo):** `http://localhost:5173`
- **Backend (RESTful API):** `http://localhost:3001`
- **Neo4j Browser:** `http://localhost:7474`

---

## 🔑 DANH SÁCH TÀI KHOẢN MẪU ĐỂ CHẤM ĐỒ ÁN

| Vai trò | Email đăng nhập | Mật khẩu mẫu | Ý nghĩa kiểm thử |
|---|---|---|---|
| **Quản trị viên (Admin)** | `admin@example.test` | `Admin@001` | Toàn quyền quản trị CRUD Sản phẩm, Danh mục, Khách hàng, xem Đồ thị gợi ý trực quan |
| **Khách hàng RC 1** | `nguyen.minh.an.001@example.test` | `RcCust@001` | Có lịch sử mua sắm đa dạng, kiểm thử thuật toán lọc cộng tác (CF) |
| **Khách hàng RC 2** | `tran.ngoc.bao.002@example.test` | `RcCust@002` | Khách hàng có hành vi tương quan mua chung với Khách 1 |
| **Khách hàng Cold-start** | `do.hai.yen.060@example.test` | `RcCust@060` | Tài khoản mới tinh, chưa từng mua sắm (kiểm thử thuật toán Fallback) |

> **Ghi chú**: Xem danh sách toàn bộ 60 tài khoản khách hàng kèm mật khẩu chi tiết tại file `ACCOUNTS.md`.

---

## 📂 CẤU TRÚC THƯ MỤC DỰ ÁN
```text
dt13-recommendation-system/
├── backend/                  # Nguồn mã nguồn Backend Express.js
│   ├── src/
│   │   ├── cypher/queries.js # Toàn bộ câu truy vấn Cypher tối ưu hóa
│   │   ├── lib/              # Thuật toán Hybrid Engine & Search Intent Parser
│   │   ├── routes/           # Các RESTful API routes
│   │   └── seed/             # Bộ sinh dữ liệu mẫu và nạp CSDL
│   ├── scripts/              # Các kịch bản schema, seed, verify, benchmark
│   └── test/                 # Bộ 130+ kiểm thử tự động
├── frontend/                 # Nguồn mã nguồn Frontend React + Vite
│   ├── src/                  # Components, Pages, State, API client
│   └── public/images/        # Bộ ảnh sản phẩm thực tế chất lượng cao
├── database/                 # Thư mục trích xuất CSDL Neo4j hoàn chỉnh
│   ├── dt13_full_database_dump.cypher  # File Cypher dump toàn bộ CSDL
│   ├── dt13_database_export.json       # Xuất CSDL định dạng JSON
│   ├── catalog-reference.json          # Dataset chuẩn 120 SP, 60 KH
│   ├── schema_constraints.cypher       # Script ràng buộc & chỉ mục
│   └── HUONG_DAN_KHOI_PHUC_DATABASE.txt
├── docs/                     # Kết quả đo kiểm hiệu năng Profile & Benchmark
├── ACCOUNTS.md               # Danh bạ 60+ tài khoản & mật khẩu kiểm thử
└── package.json              # Quản lý monorepo workspace
```
