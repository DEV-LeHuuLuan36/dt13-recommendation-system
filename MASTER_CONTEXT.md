# MASTER CONTEXT — ĐỀ TÀI 13: HỆ THỐNG GỢI Ý SẢN PHẨM TƯƠNG QUAN

> Tài liệu dành cho Cursor Agent trong dự án `D:\DoAn_NoSQL`.
> Nhiệm vụ hiện tại: thực hiện **Giai đoạn 1 — Khởi tạo dự án**, rồi báo cáo kết quả thực tế.
> Những giai đoạn còn lại là định hướng cho lần triển khai tiếp theo, chưa phải yêu cầu thực hiện ngay.

## 1. Vai trò và cách làm việc

Bạn là agent triển khai trực tiếp trên máy Windows của người dùng. Hãy đọc tài liệu này, kiểm tra thư mục đang mở và thực hiện công việc đã giao đến khi có kết quả chạy được hoặc xác định được một trở ngại thực tế.

- Thực hiện thay đổi và chạy lệnh; không chỉ đưa hướng dẫn để người dùng tự làm.
- Không hỏi lại ngôn ngữ, framework, tên thư mục hoặc cấu trúc đã chốt.
- Tự quyết định chi tiết nhỏ theo hướng đơn giản, dễ học và dễ bảo trì; ghi quyết định vào tài liệu khi cần.
- Nếu thiếu cấu hình Neo4j, vẫn hoàn thành các phần độc lập với CSDL. Báo đúng trường cấu hình còn thiếu ở cuối.
- Không đánh dấu hoàn thành một kiểm tra chưa chạy. Kiểm thử dùng đối tượng giả không chứng minh kết nối Neo4j thật.
- Khi có lỗi, tìm nguyên nhân, sửa và chạy lại đúng kiểm tra bị ảnh hưởng. Không hạ tiêu chí để có kết quả PASS.
- Đọc hướng dẫn `AGENTS.md` hoặc quy tắc của workspace nếu có. Giữ nguyên tài liệu và dữ liệu người dùng đã đặt trong thư mục.

## 2. Môi trường đã được người dùng xác nhận

| Mục | Trạng thái hoặc lựa chọn |
| --- | --- |
| Hệ điều hành | Windows 11, 64-bit |
| Workspace | `D:\DoAn_NoSQL`, đang mở trong Cursor; trước khi đặt tài liệu này, người dùng cho biết thư mục chưa có code |
| Node.js | Đã kiểm tra: `v24.15.0` |
| npm | Đã kiểm tra: `11.12.1` |
| IDE | Cursor |
| Neo4j Desktop | Người dùng đã tải; chưa có xác nhận instance đã tạo, đang chạy hoặc mật khẩu đã được cấu hình |
| GitHub | Tài khoản `DEV-LeHuuLuan36`, trang tài khoản: https://github.com/DEV-LeHuuLuan36 |
| Git trên máy | Chưa xác nhận; agent kiểm tra bằng `git --version` |
| Repository GitHub | Chưa có URL repository cụ thể |

`https://github.com/DEV-LeHuuLuan36` là URL tài khoản, không phải Git remote. Không suy đoán rằng repository `DT13-Recommendation-System` đã tồn tại.

Workspace gốc chính là `D:\DoAn_NoSQL`. Tạo `frontend` và `backend` trực tiếp bên trong; **không tạo thêm lớp thư mục** `D:\DoAn_NoSQL\DT13-Recommendation-System`.

Chỉ làm việc với dự án này. Không thay đổi dự án khác, phần mềm toàn hệ thống hoặc tiến trình không do nhiệm vụ này khởi chạy. Không dùng cổng 8000/8001 cho dự án mới.

## 3. Công nghệ đã chốt

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React + JavaScript, file `.jsx` và `.js` |
| Công cụ frontend | Vite, template `react` |
| Giao diện | CSS thuần, tiếng Việt; ưu tiên rõ ràng trên laptop và điện thoại |
| Backend | JavaScript trên Node.js 24, Express, ES Modules |
| CSDL | Neo4j chạy cục bộ qua Neo4j Desktop |
| Kết nối CSDL | Driver chính thức `neo4j-driver`, chỉ chạy ở backend |
| Đăng nhập, ở giai đoạn sau | Phiên cookie với `express-session`; băm mật khẩu bằng `node:crypto` scrypt |
| Quản lý gói | npm; một repository, hai npm workspace `frontend` và `backend` |
| Chạy cả hai dịch vụ | Script ở root, có thể dùng `concurrently` |
| Kiểm thử backend | `node:test` và `supertest` khi cần kiểm tra HTTP |

Không chuyển sang TypeScript hoặc backend Python/Java. Không bổ sung Docker, CSDL thứ hai, dịch vụ LLM hay hạ tầng triển khai cho giai đoạn khởi tạo. Thuật toán gợi ý chính phải thể hiện bằng Cypher và giải thích được từ dữ liệu đồ thị.

Neo4j 5.26 LTS là nhánh dự kiến trong đề cương. Khi kết nối được, ghi lại phiên bản và edition thực tế. Neo4j Desktop có thể cung cấp Enterprise Developer; không tự ghi rằng môi trường đang chạy Community khi chưa kiểm tra. Thiết kế các chức năng lõi bằng khả năng cơ bản của Neo4j, không phụ thuộc tính năng riêng của Enterprise.

## 4. Mục tiêu đầy đủ và thang điểm của đề tài

Tên đề tài: **Hệ thống gợi ý sản phẩm tương quan sử dụng Neo4j**.

Phạm vi nghiệp vụ: cổng bán hàng mô phỏng sản phẩm công nghệ. Mua hàng mô phỏng chỉ ghi hành vi và giá tại lúc mua, chưa cần thanh toán thật, giao vận hoặc xử lý tồn kho.

| Nhóm tiêu chí | Điểm | Kết quả cuối cùng cần có |
| --- | --- | --- |
| Phân tích lựa chọn Graph Database | 1,0 | Giải thích vì sao quan hệ khách hàng–sản phẩm phù hợp mô hình đồ thị, có giới hạn của nhận định |
| Thiết kế dữ liệu | 1,5 | Customer, Product, Category; BOUGHT, VIEWED, BELONGS_TO; hướng, thuộc tính, ràng buộc |
| CRUD nền tảng | 2,5 | CRUD sản phẩm và khách hàng, lưu/tra cứu lịch sử mua và xem |
| Gợi ý nâng cao | 2,5 | Cypher lọc cộng tác, loại hàng đã mua, tần suất, trọng số, xếp hạng |
| Dữ liệu mẫu | 1,0 | Ít nhất 100 sản phẩm, 50 khách hàng thật và 300 cạnh BOUGHT + VIEWED |
| Demo trực quan | 1,5 | Khách A đăng nhập, xem sản phẩm, nhận gợi ý; giải thích Cypher cùng đồ thị thật |

Đề còn yêu cầu phân tích truy vấn bằng EXPLAIN/PROFILE. Đưa việc này vào giai đoạn kiểm thử và báo cáo.

Không tự kết luận sản phẩm chắc chắn được 10 điểm. Không tạo số đo tốc độ, DB Hits, RAM hoặc ảnh kết quả giả. Báo cáo chỉ ghi kết quả thực sự đã chạy và nguồn lý thuyết đã kiểm chứng.

## 5. Thiết kế dữ liệu cố định cho các giai đoạn tiếp theo

### 5.1 Nút

| Nhãn | Thuộc tính chính | Quy tắc |
| --- | --- | --- |
| Customer | `customerId`, `name`, `email`, `passwordHash`, `role`, `active`, `createdAt` | Email chuẩn hóa và duy nhất; role là `customer` hoặc `admin`; không trả passwordHash trong JSON |
| Product | `productId`, `name`, `description`, `price`, `imageUrl`, `active`, `createdAt` | Giá VND là số nguyên không âm, nằm trong miền an toàn của JavaScript; ảnh có fallback cục bộ |
| Category | `categoryId`, `name`, `description` | Mỗi sản phẩm thuộc đúng một danh mục trong phạm vi đề tài |

Chuẩn ID của bộ dữ liệu mẫu: `CUST_001`, `PROD_001`, `CAT_001`. Admin riêng có thể là Customer với `customerId=ADMIN_001`, `role=admin`. Khi chứng minh đủ số khách hàng, chỉ đếm `role=customer`.

### 5.2 Quan hệ

| Quan hệ | Hướng | Thuộc tính |
| --- | --- | --- |
| BOUGHT | Customer → Product | `eventId`, `quantity`, `unitPrice`, `purchasedAt` |
| VIEWED | Customer → Product | `eventId`, `viewedAt` |
| BELONGS_TO | Product → Category | Có thể có `createdAt` |

BOUGHT và VIEWED lưu từng sự kiện. Một khách có thể mua hoặc xem cùng sản phẩm nhiều lần; mỗi lần hợp lệ có eventId riêng. Gửi lại cùng eventId không tạo thêm hành vi; cùng eventId với nội dung khác phải báo xung đột.

Giá mua lấy từ Product ở backend tại lúc ghi giao dịch. customerId lấy từ phiên đăng nhập; không tin customerId, role hoặc giá do frontend gửi. Thời gian do backend tạo, lưu dạng datetime, trả JSON dạng ISO.

Ở giai đoạn xây dựng CSDL, dùng uniqueness cho các mã nút, email và eventId của từng loại hành vi theo phiên bản Neo4j hỗ trợ. Không thêm index trùng với index đã được uniqueness tạo. Các quy tắc về thuộc tính bắt buộc, số lượng và đầu cuối quan hệ vẫn cần được kiểm tra ở backend.

### 5.3 Xóa và bảo vệ lịch sử

- Sản phẩm chưa có BOUGHT/VIEWED: được xóa cùng BELONGS_TO trong transaction.
- Sản phẩm đã có lịch sử: DELETE trả 409; cho phép chuyển `active=false` bằng PATCH.
- Khách hàng chưa có lịch sử và không phải admin đang bảo vệ: có thể xóa.
- Khách hàng có lịch sử: DELETE trả 409; có thể ngừng hoạt động.
- Danh mục đang được sản phẩm sử dụng: DELETE trả 409.

Phải có ca CRUD xóa thành công bằng bản ghi tạm, đồng thời có ca chứng minh lịch sử được giữ.

## 6. Thuật toán gợi ý cố định

### 6.1 Gợi ý cá nhân hóa

Mẫu bắt buộc:

```cypher
(c1:Customer)-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)-[:BOUGHT]->(p2:Product)
```

Đặt B(u) là tập sản phẩm phân biệt khách u đã mua:

- `sharedCount(u,v) = |B(u) ∩ B(v)|`.
- `support(u,p)` là số khách khác phân biệt có mua chung với u và đã mua p.
- `score(u,p)` là tổng sharedCount(u,v) của những khách v ủng hộ p, mỗi khách được tính một lần cho mỗi ứng viên.
- Loại khách u khỏi tập người đóng góp; chỉ dùng khách đang active với role=customer.
- Loại sản phẩm u đã mua và sản phẩm inactive khỏi ứng viên.
- Xếp `score DESC`, `support DESC`, `productId ASC`.
- Top K mặc định 5, giới hạn hợp lệ 1–20.

Phải khử trùng theo sản phẩm mua chung và cặp người đóng góp–ứng viên trước khi cộng điểm. Không lấy số dòng đường đi hoặc số lần mua lặp làm support. `COUNT(DISTINCT p2)` khi đã nhóm theo p2 không phải tần suất đúng.

### 6.2 Gợi ý theo sản phẩm đang xem

Bắt đầu từ Product đang xem, tìm những khách đã mua nó, rồi các sản phẩm khác những khách đó đã mua. Điểm là số khách mua phân biệt ủng hộ ứng viên. Loại sản phẩm nguồn, hàng hiện tại người dùng đã mua và hàng inactive.

Khách hiện tại **không cần đã mua sản phẩm đang xem**. Không thêm điều kiện BOUGHT từ khách hiện tại đến sản phẩm nguồn.

VIEWED dùng để ghi lịch sử xem. Lượt xem mới không làm đổi điểm của công thức cá nhân hóa chỉ dựa trên BOUGHT. Trên trang chi tiết, thay đổi ngữ cảnh sản phẩm đang xem có thể cho danh sách mua cùng khác.

### 6.3 Đồ thị nhỏ để kiểm tra sau này

| Khách | Sản phẩm đã mua |
| --- | --- |
| A / CUST_001 | P1 laptop, P2 bàn phím |
| B / CUST_002 | P1, P2, P3 chuột; thêm một lần mua lặp P3 |
| C / CUST_003 | P1, P3, P4 tai nghe |
| D / CUST_004 | P2, P4 |
| E / CUST_005 | Chưa mua |

Kết quả cá nhân hóa cho A trước thay đổi: P3 score=3/support=2; P4 score=2/support=2. Mua lặp của B không nhân điểm.

A đang xem P4 nhưng chưa mua P4: gợi ý mua cùng còn P3 support=1, sau khi loại P1/P2 vì A đã mua.

Sau khi A mua P3: P3 bị loại; P4 score=3/support=2.

Nếu triển khai fallback cho người chưa mua, trả `method` và lý do fallback rõ ràng; không gọi kết quả phổ biến là kết quả CF.

## 7. Quy ước API cần giữ

Chỉ hai health endpoint được triển khai trong Giai đoạn 1. Bảng dưới là hợp đồng cho các giai đoạn nghiệp vụ, không phải danh sách đã hoàn thành.

| Nhóm | Đường dẫn chính |
| --- | --- |
| Đăng nhập | POST `/api/auth/login`, POST `/api/auth/logout`, GET `/api/auth/me` |
| Sản phẩm | GET/POST `/api/products`; GET/PATCH/DELETE `/api/products/:productId` |
| Danh mục | GET/POST `/api/categories`; PATCH/DELETE `/api/categories/:categoryId` |
| Khách hàng | GET/POST `/api/customers`; GET/PATCH/DELETE `/api/customers/:customerId` |
| Xem và mua | POST `/api/interactions/views`, POST `/api/interactions/purchases` |
| Lịch sử cá nhân | GET `/api/me/history` |
| Gợi ý cá nhân | GET `/api/recommendations/me` |
| Gợi ý theo sản phẩm | GET `/api/recommendations/products/:productId` |
| Thống kê đồ thị | GET `/api/analytics/graph-stats` |
| API đang chạy | GET `/api/health` |
| Kiểm tra Neo4j, bổ sung cho khởi tạo | GET `/api/health/neo4j` |

CRUD dữ liệu quản trị chỉ dành cho admin. Các thao tác mua/xem, lịch sử và gợi ý cá nhân dành cho người dùng đã xác thực. Giới hạn dữ liệu đầu vào và kiểm tra quyền ở backend.

Danh sách dùng `items`, `page`, `pageSize`, `total`; mặc định page=1, pageSize=12, tối đa 50. Gợi ý có `method`, `items`, `limit`, `reason`; item có thông tin sản phẩm và score/support khi phương pháp đó định nghĩa chúng.

Lỗi API dùng JSON thống nhất, ví dụ `{ "error": { "code": "...", "message": "..." } }`. Chuyển Neo4j Integer sang số chỉ khi nằm trong miền an toàn; không serialize nguyên Node hoặc driver error ra frontend.

## 8. GIAI ĐOẠN 1 — CÔNG VIỆC PHẢI THỰC HIỆN NGAY

### 8.1 Kiểm tra môi trường và workspace

1. Xác nhận thư mục làm việc là `D:\DoAn_NoSQL`; dùng lệnh phù hợp Windows và liệt kê các file hiện có.
2. Đọc hướng dẫn repo nếu có. Tài liệu MASTER_CONTEXT.md này có thể là file đầu tiên trong thư mục, nên đừng yêu cầu thư mục phải trống tuyệt đối.
3. Chạy `node -v`, `npm -v`, `git --version`; ghi kết quả thật. Giữ Node 24 đang dùng nếu đáp ứng các gói chọn cài, không tự nâng cấp Node hoặc npm toàn hệ thống.
4. Nếu PowerShell chặn npm.ps1, dùng `npm.cmd`/`npx.cmd`. Không sửa ExecutionPolicy toàn hệ thống.
5. Kiểm tra cổng 3001 và 5173. Không kill tiến trình đang chiếm cổng. Nếu cần, chọn cặp cổng khác còn trống, cập nhật đồng bộ `.env`, proxy và URL chạy thật.

### 8.2 Tạo repository và cấu trúc

Tạo các phần sau ngay dưới workspace:

| Đường dẫn | Trách nhiệm |
| --- | --- |
| `package.json` | private=true, workspaces frontend/backend, scripts chạy và kiểm tra |
| `package-lock.json` | Lockfile ở root sau khi cài dependencies |
| `.gitignore` | Bỏ qua node_modules, dist, coverage, log và các `.env` thật; giữ `.env.example` |
| `AGENTS.md` | Hướng dẫn repo ngắn: stack, lệnh, scope, đọc MASTER_CONTEXT.md/TASKS.md, không lộ secrets |
| `MASTER_CONTEXT.md` | Giữ tài liệu này làm ngữ cảnh chung |
| `TASKS.md` | Checklist từng giai đoạn, chỉ đánh dấu mục đã làm |
| `README.md` | Hướng dẫn chạy trên Windows và cấu hình Neo4j |
| `frontend/` | Ứng dụng React/Vite JavaScript |
| `backend/` | Express ES Modules, config, driver, health routes và kiểm thử cần thiết |
| `docs/SETUP_REPORT.md` | Kết quả kiểm tra môi trường và khởi tạo thực tế |
| `docs/GRAPH_MODEL.md` | Tóm tắt mô hình ở mục 5–6, ghi rõ là thiết kế chưa nạp dữ liệu |

Tên kỹ thuật cho package có thể là `dt13-recommendation-system`, `@dt13/frontend`, `@dt13/backend`. Không dùng TypeScript.

Nếu Git có sẵn và chưa có `.git` của dự án này, khởi tạo local với nhánh `main`. Kiểm tra Git đang thuộc đúng workspace, không thao tác nhầm repository ở thư mục cha. Nếu đã có Git của dự án thì giữ nguyên cấu hình hiện có.

Chưa đặt remote khi chỉ có URL tài khoản. Không tự tạo repository GitHub, commit hoặc push ở nhiệm vụ khởi tạo này. Không đổi git config global. Nếu Git chưa có, hoàn thành scaffold và ghi rõ Git chưa được khởi tạo.

### 8.3 Khởi tạo npm workspace và cài packages

- Frontend dùng scaffold tương đương `npm create vite@latest frontend -- --template react --no-interactive`. Nếu môi trường không phù hợp scaffold này, tạo cấu trúc React/Vite tương đương một cách rõ ràng.
- Backend có `"type": "module"`; cài `express`, `neo4j-driver`, `dotenv`, `express-session`.
- Root dùng `concurrently` để chạy cả hai dịch vụ; backend có thể dùng `node --watch` thay nodemon.
- Cài ESLint và các cấu hình tối thiểu cần thiết cho JavaScript frontend/backend; có thể tận dụng ESLint của template React.
- Nếu viết các ca kiểm tra HTTP ở mục 8.8, cài supertest ở devDependencies backend; dùng node:test, không cần framework test lớn.
- Đọc yêu cầu engines của packages; chọn bản ổn định tương thích Node hiện có. Ghi lockfile và phiên bản cài thực tế, không ghi các phiên bản dự đoán như đã cài.
- Giữ một root lockfile cho npm workspace; hoàn tất cài đặt từ root. Không trộn npm/pnpm/yarn.
- Không dùng `npm audit fix --force` để đổi major tự động. Nếu gặp lỗi dependency, sửa nguyên nhân cụ thể.

Scripts bắt buộc có ý nghĩa thật:

| Script ở root | Hành vi |
| --- | --- |
| `npm run dev` | Chạy đồng thời frontend và backend từ workspace gốc |
| `npm run dev:frontend` | Chạy riêng frontend |
| `npm run dev:backend` | Chạy riêng backend |
| `npm run build` | Build frontend |
| `npm run lint` | Kiểm tra frontend và backend; không âm thầm bỏ qua backend |
| `npm test` | Chạy các ca kiểm tra backend đã tạo |
| `npm run check:neo4j` | Kiểm tra kết nối CSDL thật, chỉ đọc, exit code phản ánh đúng kết quả |

Đừng thêm script seed/reset giả hoặc script luôn exit 0 cho phần chưa triển khai.

### 8.4 Cấu hình môi trường

Frontend chỉ có cấu hình công khai. Tạo `frontend/.env.example` và bản `.env` local nếu chưa có:

```dotenv
VITE_DEV_PORT=5173
VITE_API_PROXY_TARGET=http://127.0.0.1:3001
```

Backend có `backend/.env.example`:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=
NEO4J_DATABASE=neo4j
SESSION_SECRET=
```

Tạo `backend/.env` local nếu chưa có, giữ NEO4J_PASSWORD trống khi người dùng chưa cung cấp. Với SESSION_SECRET, agent được tạo chuỗi ngẫu nhiên bằng `node:crypto` và ghi vào `.env` local, không in giá trị ra terminal, không đưa vào report. Không ghi mật khẩu thật vào `.env.example`.

- Đường dẫn `.env` backend phải được resolve ổn định, để script vẫn hoạt động khi gọi từ root qua workspace.
- Không ghi đè `.env` đã có của người dùng và không in toàn bộ env.
- React không được chứa NEO4J_PASSWORD, SESSION_SECRET hoặc neo4j-driver. Vite chỉ đọc cấu hình frontend công khai, không đọc file `.env` backend.
- Cấu hình proxy `/api` của Vite đến API target; React gọi URL tương đối `/api/...`, dùng cookie credentials khi cần.
- Vite bind `127.0.0.1` với strictPort; Express cũng bind `127.0.0.1` trong giai đoạn local.
- Khi đổi cổng, sửa cấu hình frontend/backend đồng bộ trước khi kiểm tra.

### 8.5 Backend tối thiểu chạy thật

Tách `app.js` và `server.js` để kiểm thử HTTP không phải khởi động một cổng cố định. Tách config, kết nối Neo4j, health routes và error middleware với số file vừa đủ, không tạo hàng loạt module rỗng cho chức năng tương lai.

**GET /api/health**:

- Trả HTTP 200 khi Express đang chạy, ví dụ `{ "status": "ok", "service": "dt13-api" }`.
- Đây là trạng thái API, không tuyên bố Neo4j đã kết nối.
- Không trả env, mật khẩu, session secret hoặc thông tin máy nhạy cảm.

**GET /api/health/neo4j**:

- Khi chưa có cấu hình đầy đủ: HTTP 503, code `NEO4J_NOT_CONFIGURED`, thông báo tiếng Việt dễ hiểu.
- Khi có cấu hình: thực hiện truy vấn đọc `RETURN 1 AS ok` qua neo4j-driver với database từ env; chỉ trả HTTP 200 và `{ "status": "connected" }` khi truy vấn thành công.
- Khi mật khẩu sai, instance dừng, database không tồn tại hoặc kết nối lỗi: HTTP 503, code `NEO4J_UNAVAILABLE`, thông báo an toàn. Không biến lỗi thành thành công.
- Cấu hình timeout ngắn hợp lý, khoảng 3–5 giây ở những tùy chọn driver/transaction hỗ trợ, để kiểm tra không treo quá lâu.
- Có thể dùng dependency injection để unit test trạng thái thành công/thất bại; không dùng đối tượng giả trong đường chạy ứng dụng thật.

Neo4j driver được tạo một lần cho backend khi cấu hình đủ, không tạo một driver mới cho từng request. Đóng session trong finally và đóng driver khi shutdown. Backend vẫn khởi động được nếu cấu hình Neo4j còn thiếu.

Có middleware JSON, 404 JSON và xử lý lỗi nhất quán; không trả raw stack/driver error. Các endpoint nghiệp vụ ở mục 7 chưa triển khai thì chưa mount, không trả dữ liệu cứng để làm như đã xong.

express-session đã được cài để dùng ở giai đoạn đăng nhập; giai đoạn 1 không cần triển khai đăng nhập hoặc tạo tài khoản. Nếu agent đã wire middleware phiên, dùng secret từ env, cookie httpOnly/sameSite phù hợp local và ghi rõ MemoryStore chỉ dùng cho môi trường demo local.

### 8.6 Frontend tối thiểu có kiểm tra kết nối

Thay trang demo mặc định của Vite bằng trang kiểm tra khởi tạo của đề tài:

- Tiêu đề: “Hệ thống gợi ý sản phẩm tương quan”.
- Mô tả ngắn về hệ thống sử dụng Neo4j.
- Hai trạng thái riêng: API và Neo4j, lấy từ hai health endpoint thật.
- Nút “Kiểm tra lại”.
- Trạng thái đang tải, kết nối thành công, chưa cấu hình và lỗi; màu sắc kèm chữ, không chỉ dựa vào màu.
- Khi Neo4j chưa cấu hình, hiển thị “Chưa cấu hình kết nối Neo4j”, không hiển thị “Đã kết nối”.
- Nếu API không chạy, xử lý fetch failure và hiển thị lỗi dễ hiểu, không crash trang.
- Bố cục gọn, responsive, tiếng Việt có dấu, UTF-8; nút và vùng thông báo có ngữ nghĩa truy cập phù hợp.

Đây là trang kiểm tra cho giai đoạn khởi tạo; trang sản phẩm và các luồng nghiệp vụ sẽ thay thế hoặc bổ sung ở giai đoạn sau. Không thêm số sản phẩm, số khách hoặc điểm gợi ý giả lên trang này.

### 8.7 Script kiểm tra Neo4j thật và README

`npm run check:neo4j` đọc config backend, kiểm tra cấu hình, chạy truy vấn đọc và đóng driver trước khi thoát. Khi thành công có thể đọc `CALL dbms.components()` để ghi phiên bản/edition thực tế nếu có quyền. Không đọc được thông tin phiên bản thì ghi chưa xác định, không suy đoán.

Script phải:

- Exit 0 khi kiểm tra kết nối thật thành công.
- Exit khác 0 khi thiếu cấu hình hoặc kết nối thất bại, với thông báo không chứa mật khẩu.
- Chỉ đọc; không tạo constraints, seed hoặc xóa dữ liệu trong giai đoạn này.

README phải đủ để người dùng mới chạy trên Windows:

1. Yêu cầu Node/npm và thư mục root.
2. `npm install` từ root; trường hợp npm.ps1 bị chặn dùng npm.cmd.
3. Vị trí `.env.example` và `.env`; giải thích SESSION_SECRET và các trường Neo4j.
4. Mở Neo4j Desktop, tạo/start một instance dành riêng cho đề tài, ví dụ tên DT13; người dùng tự đặt mật khẩu nếu chưa có instance.
5. Phân biệt **tên instance DT13** và **tên database thường là neo4j**. Lấy URI/database theo môi trường thực tế; giá trị trong ví dụ chỉ là mặc định local.
6. Điền mật khẩu vào backend/.env tại máy, không gửi vào chat/report/Git.
7. `npm run dev`, URL frontend/backend thực tế, cách Ctrl+C dừng các dịch vụ do script này chạy.
8. Các lệnh lint/build/test/check:neo4j và ý nghĩa 503 khi CSDL chưa sẵn sàng.
9. GitHub hiện chưa có repository remote cụ thể; không dùng URL tài khoản làm remote.

Không tự khởi chạy DBMS khác, đổi mật khẩu Neo4j hoặc đọc kho credential của ứng dụng để đoán mật khẩu. Nếu GUI hoặc mật khẩu chưa sẵn sàng, ghi bước còn thiếu cụ thể trong báo cáo.

### 8.8 Kiểm tra và tiêu chí hoàn thành Giai đoạn 1

Thực hiện các kiểm tra sau và ghi kết quả thật:

| Kiểm tra | Kết quả cần xác nhận |
| --- | --- |
| Cài dependencies | npm install kết thúc thành công, có lockfile |
| Lint | Frontend và backend đều được kiểm tra, không có lỗi |
| Build | Frontend build thành công |
| HTTP /api/health | API thật trả 200 và không chứa secrets |
| HTTP /api/health/neo4j | Phản ánh đúng tình trạng hiện có: 200 khi đã kết nối; 503 khi thiếu config hoặc CSDL không truy cập được |
| Chạy từ root | npm run dev khởi động cả hai dịch vụ với cấu hình proxy đúng |
| Trang web | Trang tải được, gọi /api qua Vite; không có lỗi build/runtime đã quan sát được |
| Git | Repo local thuộc đúng workspace nếu có Git; `.env` thật không bị theo dõi |
| Tài liệu | README, TASKS, AGENTS, GRAPH_MODEL và SETUP_REPORT tồn tại, đúng trạng thái |

Viết ít nhất các ca HTTP có ý nghĩa bằng node:test/supertest: health API không lộ secrets; trạng thái Neo4j thiếu config trả 503; kết nối thất bại trả 503 an toàn. Có thể thêm ca thành công qua adapter giả để kiểm tra hợp đồng endpoint. Ghi rõ đây là kiểm thử offline; không coi đó là kiểm tra CSDL thật.

Nếu có công cụ preview/browser đã được cấp trong Cursor, xem trang và console/network. Nếu không có, kiểm tra HTTP tài nguyên/frontend và ghi **chưa kiểm tra trực quan**, không tuyên bố đã xem giao diện.

Trong kiểm tra live, chỉ khởi chạy và dừng những tiến trình do nhiệm vụ này tạo. Dừng các tiến trình kiểm tra tạm khi xong; để người dùng chạy lại bằng npm run dev. Không kill theo tên node.exe chung hoặc theo cổng mà chưa xác định chủ sở hữu.

**Đánh giá trạng thái đúng**:

- `SCAFFOLD_READY`: dependencies, lint, build, test và chạy frontend/backend đã đạt. Nếu DB chưa cấu hình, vẫn có thể đạt trạng thái này, với health Neo4j trả 503 đúng.
- `NEO4J_CONNECTED`: chỉ ghi thêm khi kiểm tra live CSDL thật đạt.
- Nếu chưa có mật khẩu/instance, mục kết nối CSDL là `BLOCKED_CONFIGURATION`, không phải PASS.
- Nếu lint/build/API chưa đạt, nhiệm vụ khởi tạo còn lỗi; sửa tiếp trong phạm vi được giao.

### 8.9 Báo cáo cuối của agent

Ghi `docs/SETUP_REPORT.md` và trả lời tiếng Việt ngắn gọn, gồm:

1. Những file/chức năng khởi tạo đã tạo và stack thực tế.
2. Phiên bản Node/npm/packages đã quan sát; phiên bản Neo4j chỉ ghi khi xác định được.
3. Lệnh kiểm tra và PASS/FAIL/BLOCKED/NOT_CHECKED, có nguyên nhân cụ thể.
4. URL và cổng thật; lệnh chạy từ `D:\DoAn_NoSQL`.
5. Tình trạng Git local/remote, không ghi là đã đẩy GitHub khi chưa có remote.
6. Những trường Neo4j còn thiếu hoặc thao tác Desktop người dùng cần làm, nếu có; không hỏi lại trước khi hoàn thành phần khởi tạo độc lập.
7. Trạng thái Giai đoạn 1 và bước tiếp theo: schema, seed và đăng nhập/CRUD sau khi môi trường đã sẵn sàng.

Không kèm giá trị mật khẩu, secret hoặc token. Không báo rằng đã hoàn thành hệ thống gợi ý khi mới hoàn thành bộ khung.

## 9. Các giai đoạn tiếp theo — CHƯA THỰC HIỆN TRONG LỆNH KHỞI TẠO

| Giai đoạn | Phạm vi | Minh chứng cần giữ |
| --- | --- | --- |
| 2 | Schema, constraints, seed có thể chạy lại, đăng nhập và phân quyền | Truy vấn đếm thật, tài khoản demo, ca đăng nhập và quyền |
| 3 | CRUD sản phẩm/khách hàng/danh mục, mua/xem, lịch sử | Ca thêm/sửa/xóa và bảo vệ lịch sử, idempotency hành vi |
| 4 | Cypher gợi ý cá nhân và mua cùng, API và React | Đồ thị nhỏ có kết quả tính tay, khử trùng, loại hàng đã mua, lý do gợi ý |
| 5 | Tích hợp giao diện, thống kê, EXPLAIN/PROFILE, demo và báo cáo | Kiểm thử tổng thể, kế hoạch truy vấn, số đo thật, ảnh và kịch bản bảo vệ |

Bộ dữ liệu mục tiêu để triển khai ở Giai đoạn 2, **chưa phải dữ liệu đã nạp**:

| Dữ liệu | Mục tiêu |
| --- | --- |
| Product | 105 |
| Customer role=customer | 55 |
| Admin riêng | 1 |
| Category | 6 |
| BOUGHT | 260 sự kiện, gồm một lần mua lặp trong đồ thị kiểm tra |
| VIEWED | 180 sự kiện |
| BOUGHT + VIEWED | 440, đạt ngưỡng ít nhất 300 |
| BELONGS_TO | 105, không tính vào ngưỡng hành vi |
| Tổng nút dự kiến | 167 |
| Tổng cạnh dự kiến | 545 |

Seed về sau phải kiểm tra tính đúng bằng dữ liệu tạo ra và truy vấn đếm sau khi nạp, không chỉ ghi số lượng trong README. Không dùng reset/xóa toàn bộ graph làm bước tự động của npm run dev.

Các test thay đổi dữ liệu dùng database/instance kiểm thử riêng hoặc dataset test được xác định rõ. Không xóa lịch sử demo của người dùng để làm test đi qua.

## 10. Tài liệu và nguyên tắc ghi báo cáo

Đề cương đã thống nhất: `DT13_Chi_tiet_React_JavaScript_Neo4j.md`. Nếu người dùng đặt file này vào workspace, đọc để lấy thiết kế chi tiết, API và ví dụ seed. Nếu file chưa có, tài liệu MASTER_CONTEXT này đủ để khởi tạo; không yêu cầu người dùng gửi lại để thực hiện Giai đoạn 1.

Nguồn học phần:

- `Danh Sách Đề Tài Cuối Môn NoSQL.pdf`, đề tài 13 ở trang 25–26.
- `Chương 4. Neo4J.pdf`, kiến thức graph/Cypher/driver dùng cho bài.
- `DT13 HỆ THỐNG GỢI Ý SẢN PHẨM TƯƠNG QUAN.docx`, khung Word của nhóm.
- `Bao_cao_NovaLap_4_NoSQL_final.docx`, chỉ tham khảo cách trình bày, không chuyển phạm vi bài thành bốn CSDL.

Agent không được nói đã đọc những file chưa có trong workspace. Giữ cấu trúc báo cáo học phần 5 chương đã thống nhất; chưa soạn lại Word trong nhiệm vụ khởi tạo code.

Nguồn kỹ thuật chính thức để đối chiếu khi cần; chỉ truy cập thông tin liên quan:

- Vite: https://vite.dev/guide/
- Express: https://expressjs.com/en/starter/installing.html
- Neo4j Desktop: https://neo4j.com/docs/desktop/current/installation/
- Neo4j JavaScript driver: https://neo4j.com/docs/javascript-manual/current/install/
- npm workspaces: https://docs.npmjs.com/cli/v11/using-npm/workspaces/
- Node.js scrypt: https://nodejs.org/docs/latest-v24.x/api/crypto.html

Để viết báo cáo: giải thích hành vi và mô hình trước, code chỉ đưa vào chỗ giúp minh họa. Không khẳng định JOIN luôn có độ phức tạp O(N^k), Neo4j luôn O(1), hoặc thời gian đo đã tối ưu nếu chưa có dữ liệu thực nghiệm.

## 11. LỆNH KÍCH HOẠT CHO CURSOR AGENT

```text
Bạn đang làm trong D:\DoAn_NoSQL. Đọc MASTER_CONTEXT.md tại root và mọi hướng dẫn workspace áp dụng, sau đó thực hiện đầy đủ mục 8: GIAI ĐOẠN 1 — KHỞI TẠO DỰ ÁN.

Hãy trực tiếp tạo frontend React/Vite JavaScript, backend Node.js/Express, npm workspace, cấu hình Neo4j, health endpoints, trang kiểm tra kết nối, scripts, Git local nếu Git có sẵn, kiểm tra cần thiết và tài liệu. Chạy cài đặt, lint, build, test và kiểm tra live từ root; sửa lỗi phát hiện được.

Giữ đúng workspace D:\DoAn_NoSQL, không tạo thêm thư mục dự án lồng bên trong. Node hiện có v24.15.0 và npm 11.12.1; kiểm tra thực tế rồi dùng. GitHub DEV-LeHuuLuan36 mới là tài khoản, chưa phải repository remote.

Nếu chưa có mật khẩu Neo4j hoặc instance chưa chạy, hoàn thành toàn bộ phần độc lập với CSDL và giữ trạng thái Neo4j là chưa cấu hình/không truy cập được. Không đoán mật khẩu, không giả kết nối thành công. Ghi các bước còn thiếu ở cuối.

Chỉ triển khai Giai đoạn 1 trong lượt này. Cập nhật TASKS.md và docs/SETUP_REPORT.md theo kết quả thực tế, rồi báo cáo ngắn gọn bằng tiếng Việt: đã tạo gì, kiểm tra nào đạt, phần nào còn thiếu, lệnh chạy và URL thật. Không chỉ trả lại kế hoạch và không hỏi lại các lựa chọn đã chốt.
```
