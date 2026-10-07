# GRAPH_MODEL — Mo hinh do thi (thiet ke, chua nap du lieu)

> Tom tat cac muc 5 va 6 cua MASTER_CONTEXT.md. Day la **thiet ke** se duoc trien khai o cac giai doan sau. Trong Giai doan 1 chua nap du lieu, chi co hai health endpoint va kiem tra ket noi CSDL.

## 1. Nut (Node)

| Nhan | Thuo tinh chinh | Rang buoc |
| --- | --- | --- |
| `Customer` | `customerId`, `name`, `email`, `passwordHash`, `role`, `active`, `createdAt` | Email chuan hoa viet thuong, duy nhat; `role` la `customer` hoac `admin`; khong tra `passwordHash` trong JSON |
| `Product` | `productId`, `name`, `description`, `price`, `imageUrl`, `active`, `createdAt` | `price` la so nguyen VND >= 0, nam trong mien an toan JS; `imageUrl` co fallback cuc bo |
| `Category` | `categoryId`, `name`, `description` | Moi san pham thuoc dung mot danh muc |

### Chuan ID

- `CUST_001`, `PROD_001`, `CAT_001`.
- Admin rieng: `Customer` voi `customerId = ADMIN_001`, `role = admin`.

### Chuan hoa va an toan

- `passwordHash` duoc tao bang `node:crypto` scrypt, dinh dang `scrypt$N$r$p$salt$hash` (se o trong Giai doan 2).
- `price` luu so nguyen VND; truong hop > `Number.MAX_SAFE_INTEGER` can chuyen sang BigInt hoac xu ly dac biet.
- Thoi gian luu `datetime`, response ISO client xuat `string`.

## 2. Quan he (Edge)

| Quan he | Huong | Thuo tinh | Quy tac |
| --- | --- | --- | --- |
| `BOUGHT` | Customer → Product | `eventId`, `quantity`, `unitPrice`, `purchasedAt` | Moi su kien luu mot dong; `quantity > 0`, `unitPrice` lay tu `Product` tai thoi diem mua |
| `VIEWED` | Customer → Product | `eventId`, `viewedAt` | Moi luot xem mot dong; khong anh huong cong thuc goi y ca nhan hoa |
| `BELONGS_TO` | Product → Category | `createdAt` (co the co) | Moi Product thuoc dung mot Category |

### Idempotency

- Gui lai cung `eventId` voi noi dung giong: khong tao them hanh vi.
- Cung `eventId` voi noi dung khac: backend phai tra loi xung dot.

### Nguon du lieu tin cay

- `customerId`, `role` lay tu phien dang nhap, khong tin client.
- `unitPrice`, `purchasedAt`, `viewedAt` do backend tao.
- `price` lay tu `Product` o thoi diem giao dich.

### Constraints (Giai doan 2)

- Uniqueness: `Customer.email`, `Product.productId`, `Category.categoryId`, `Category.name`, `BOUGHT.eventId`, `VIEWED.eventId` (theo phien kha cua Neo4j).
- Cac rang buoc bat buoc thuoc tinh, so luong, dau cuoi quan he duoc kiem tra o backend.

## 3. Xoa va bao ve lich su (Giai doan 3)

| Truong hop | Hieu ung |
| --- | --- |
| San pham chua co BOUGHT/VIEWED | Xoa cung `BELONGS_TO` trong transaction |
| San pham co lich su | DELETE 409; cho phep `PATCH active=false` |
| Khach chua co lich su va khong phai admin bao ve | Co the xoa |
| Khach co lich su | DELETE 409; co the dung hoat dong (`active=false`) |
| Danh muc dang duoc su dung | DELETE 409 |

Bat buoc co ca xoa thanh cong (du lieu tam) va ca chung minh lich su duoc giu.

## 4. Cong thuc goi y (Giai doan 4)

### 4.1 Ca nhan hoa (Collaborative Filtering)

Mau bat buoc:

```cypher
(c1:Customer)-[:BOUGHT]->(p1:Product)<-[:BOUGHT]-(c2:Customer)-[:BOUGHT]->(p2:Product)
```

Dinh nghia:

- `B(u)` = tap san pham phan biet khach `u` da mua.
- `sharedCount(u, v)` = `|B(u) ∩ B(v)|`.
- `support(u, p)` = so khach khac phan biet da mua chung voi `u` va da mua `p`.
- `score(u, p)` = tong `sharedCount(u, v)` cua cac khach `v` ung ho `p`, moi khach dem mot lan cho moi ung vien.

Rang buoc:

- Loai khach `u` khoi tap dong gop.
- Chi dung khach `active=true`, `role=customer`.
- Loai san pham `u` da mua va san pham `active=false` khop ung voi p.
- Sap xep `score DESC`, `support DESC`, `productId ASC`.
- Top K mac dinh 5, gioi han hop le 1..20.

Khử trùng:

- Phai khu trung theo san pham mua chung va cap (dong gop, ung vien) truoc khi cong diem.
- `COUNT(DISTINCT p2)` khi da nhom theo `p2` khong phai tan suat dung.

### 4.2 Theo san pham dang xem (Co-purchase)

Tu Product dang xem, tim cac khach da mua no, sau do cac san pham khac nhung khach do da mua.

- Diem = so khach mua phan biet ung ho ung vien.
- Loai san pham nguon, san pham khach da mua, san pham `active=false`.
- Khach hien tai khong can da mua san pham dang xem.
- Khong them `BOUGHT` tu khach hien tai den san pham nguon.

`VIEWED` chi ghi lich su, khong doi diem cua cong thuc 4.1.

### 4.3 Fallback

- Nguoi chua mua (kho co ket qua CF): tra `method="popular"` và ly do fallback ro rang; khong goi la CF.

## 5. Do thi nho de kiem tra (Giai doan 4)

| Khach | San pham da mua |
| --- | --- |
| A / CUST_001 | P1, P2 |
| B / CUST_002 | P1, P2, P3, P3 (mua lap) |
| C / CUST_003 | P1, P3, P4 |
| D / CUST_004 | P2, P4 |
| E / CUST_005 | Chua mua |

Ket qua mong doi cho A (truoc khi A mua P3):
- P3: `score=3`, `support=2`.
- P4: `score=2`, `support=2`.
- Mua lap cua B khong nhan diem.

A dang xem P4 (chua mua P4):
- Sau khi loai P1, P2 (A da mua) → con P3 voi `support=1`.

Sau khi A mua P3: P3 bi loai → P4 `score=3`, `support=2`.

## 6. Trang thai trien khai

- Cac nuat/cong thuc tren chu duoc nap store. Giai doan 1 moi kiem tra driver 1 connection.
- So lieu cuoi gia (Product ~105, Service role=customer ~55, 1 admin, 6 danh muc, 260 BOUGHT + 180 VIEWED, 105 BELONGS_TO) se nap o Giai doan 2 sau khi constraints san sang.