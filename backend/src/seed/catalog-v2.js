// Catalog V2 - 150 san pham cong nghe that, 6 category.
// Moi product co businessId (PROD_106..PROD_255), ten theo brand+model, gia demo VND,
// mo ta tieng Viet 2-4 cau, imageUrl local. Thong tin model la cac san pham thuong gap
// tren thi truong theo cac hang Apple/Samsung/Dell/HP/Lenovo/Asus/Acer/Logitech/Razer/
// Sony/Bose/JBL/Sennheiser/Anker/Ugreen/Brother/Casio/Citizen/Seiko/SanDisk/WD/Seagate/
// Kingston/Crucial/TP-Link/Asus/Netgear/Google Nest/Mi/Xiaomi/Oppo/Vivo/Realme/Nokia....
//
// KHONG dung stock photo. Moi imageUrl la duong dan local theo model slug de UI load
// (UI render duoc khi anh ton tai; anh chua tai se hien placeholder).
//
// Nguon: tong hop tu cac hang pho bien den 2026. Gia chi la so demo cho de tai.
//
// Quy uoc category:
//  CAT_001 - Laptop (may tinh xach tay)
//  CAT_002 - Dien thoai (smartphone)
//  CAT_003 - Am thanh (tai nghe, loa)
//  CAT_004 - Phu kien (chuot, ban phim, cap, sac, USB hub)
//  CAT_005 - Dong ho thong minh (smartwatch, vong tay)
//  CAT_006 - May tinh vi (tablet, iPad)

export const CATEGORIES_V2 = [
  { categoryId: 'CAT_001', name: 'Laptop', description: 'May tinh xach tay cac hang Apple, Dell, HP, Lenovo, Asus, Acer, MSI' },
  { categoryId: 'CAT_002', name: 'Dien thoai', description: 'Smartphone Android va iPhone cac phan khuc' },
  { categoryId: 'CAT_003', name: 'Am thanh', description: 'Tai nghe, loa bluetooth, micro' },
  { categoryId: 'CAT_004', name: 'Phu kien', description: 'Chuot, ban phim, cap, sac, USB hub' },
  { categoryId: 'CAT_005', name: 'Dong ho thong minh', description: 'Smartwatch, vong tay theo doi suc khoe' },
  { categoryId: 'CAT_006', name: 'May tinh vi', description: 'Tablet, iPad cac kich thuoc' },
];

const V2_MARKER = 'DT13_SEED_V2';

// Moi product co: businessId, name, description, price, imageUrl, active, categoryId
// businessId dang PROD_106..PROD_255 (150 san pham).
// imageUrl: /images/products/{businessId}-{slug}.jpg (anh se duoc tai o buoc sau).
const RAW = [
  // === Laptop (CAT_001) === 32 san pham, gia 12-55 trieu
  { id: 'PROD_106', name: 'MacBook Air 13 inch M3 8GB 256GB', cat: 'CAT_001', price: 27_990_000, desc: 'Laptop Apple M3 8-core CPU, GPU 8-core, RAM 8GB, SSD 256GB. Man hinh Liquid Retina 13.6 inch, thoi luong pin 18h. Phu hop van phong va di dong.' },
  { id: 'PROD_107', name: 'MacBook Air 13 inch M3 8GB 512GB', cat: 'CAT_001', price: 32_990_000, desc: 'Phien ban SSD 512GB cua MacBook Air M3. CPU 8-core, GPU 8-core, Neural Engine 16-core. Pin 18h, sac nhanh 35W.' },
  { id: 'PROD_108', name: 'MacBook Air 15 inch M3 8GB 256GB', cat: 'CAT_001', price: 32_990_000, desc: 'MacBook Air M3 15.3 inch Liquid Retina, loa 6 cham, micro dam dam chat luong studio. SSD 256GB.' },
  { id: 'PROD_109', name: 'MacBook Pro 14 inch M3 8GB 512GB', cat: 'CAT_001', price: 39_990_000, desc: 'MacBook Pro 14 inch M3 8-core CPU, 10-core GPU, 8GB RAM, SSD 512GB. Man hinh ProMotion 120Hz, HDMI, SDXC, MagSafe.' },
  { id: 'PROD_110', name: 'MacBook Pro 14 inch M3 Pro 18GB 512GB', cat: 'CAT_001', price: 52_990_000, desc: 'MacBook Pro 14 M3 Pro 11-core CPU, 14-core GPU, 18GB. Pin 18h, loa 6 chat luong cao, ba nhieu CPU hon M3.' },
  { id: 'PROD_111', name: 'Dell XPS 13 9340 Core Ultra 7 16GB 512GB', cat: 'CAT_001', price: 36_990_000, desc: 'Laptop Dell XPS 13 9340 chip Intel Core Ultra 7 155H, 16GB LPDDR5x, SSD 512GB. Man hinh 13.4 inch FHD+.' },
  { id: 'PROD_112', name: 'Dell XPS 14 9440 Core Ultra 7 16GB 1TB', cat: 'CAT_001', price: 47_990_000, desc: 'Dell XPS 14 9440, Core Ultra 7 155H, RTX 4050 Laptop 6GB, 16GB RAM, SSD 1TB. Man hinh 14.5 inch OLED tuy chon.' },
  { id: 'PROD_113', name: 'Dell XPS 15 9530 Core i7 16GB 512GB RTX 4050', cat: 'CAT_001', price: 49_990_000, desc: 'Dell XPS 15 9530, Core i7-13700H, RTX 4050 6GB, 16GB DDR5, SSD 512GB. Man hinh 15.6 inch OLED 3.5K.' },
  { id: 'PROD_114', name: 'Dell Inspiron 14 5440 Core i5 8GB 512GB', cat: 'CAT_001', price: 16_990_000, desc: 'Dell Inspiron 14 pho thong, Core i5-1334U, 8GB DDR4, SSD 512GB. Phu hop hoc tap, van phong.' },
  { id: 'PROD_115', name: 'HP Pavilion 15 eg3093TU Core i5 8GB 512GB', cat: 'CAT_001', price: 17_490_000, desc: 'HP Pavilion 15, Core i5-1235U, 8GB RAM, SSD 512GB. Man hinh 15.6 inch FHD IPS, ban phim so.' },
  { id: 'PROD_116', name: 'HP Envy 13 ba1030TU Core Ultra 5 16GB 512GB', cat: 'CAT_001', price: 24_990_000, desc: 'HP Envy 13, Core Ultra 5 125U, 16GB LPDDR5, SSD 512GB. Vỏ nhom, nhe 1.3kg.' },
  { id: 'PROD_117', name: 'HP Spectre x360 14 eu0050TU Core Ultra 7 16GB 1TB', cat: 'CAT_001', price: 41_990_000, desc: 'HP Spectre x360 14, Core Ultra 7 155H, 16GB, SSD 1TB, OLED 2.8K cam ung, xoay 360 do.' },
  { id: 'PROD_118', name: 'HP Omen 16 wf0129TX Core i7 16GB 1TB RTX 4060', cat: 'CAT_001', price: 39_990_000, desc: 'HP Omen 16 gaming, Core i7-14700HX, RTX 4060 8GB, 16GB DDR5, SSD 1TB, man 16.1 QHD 240Hz.' },
  { id: 'PROD_119', name: 'Lenovo ThinkPad X1 Carbon Gen 12 Core Ultra 7 16GB 512GB', cat: 'CAT_001', price: 44_990_000, desc: 'Lenovo ThinkPad X1 Carbon Gen 12, Core Ultra 7 155H, 16GB LPDDR5x, SSD 512GB, 14 inch 2.8K OLED tuy chon.' },
  { id: 'PROD_120', name: 'Lenovo ThinkPad E14 Gen 5 Core i5 8GB 512GB', cat: 'CAT_001', price: 18_490_000, desc: 'Lenovo ThinkPad E14 Gen 5 cho doanh nghiep, Core i5-1335U, 8GB DDR4, SSD 512GB.' },
  { id: 'PROD_121', name: 'Lenovo IdeaPad Slim 5 14ABR8 Ryzen 5 16GB 512GB', cat: 'CAT_001', price: 16_490_000, desc: 'Lenovo IdeaPad Slim 5 14 inch, AMD Ryzen 5 7530U, 16GB RAM, SSD 512GB. Pin 9h.' },
  { id: 'PROD_122', name: 'Lenovo Legion 5 16IRX9 Core i7 16GB 1TB RTX 4060', cat: 'CAT_001', price: 36_990_000, desc: 'Lenovo Legion 5 16IRX9 gaming, Core i7-14650HX, RTX 4060 8GB, 16GB DDR5, SSD 1TB, 16 inch WQXGA 240Hz.' },
  { id: 'PROD_123', name: 'Asus ZenBook 14 OLED UX3405MA Core Ultra 7 16GB 1TB', cat: 'CAT_001', price: 32_990_000, desc: 'Asus ZenBook 14 OLED, Core Ultra 7 155H, 16GB, SSD 1TB, 14 inch 2.8K OLED 120Hz.' },
  { id: 'PROD_124', name: 'Asus VivoBook 15 X1504ZA Core i3 8GB 256GB', cat: 'CAT_001', price: 11_490_000, desc: 'Asus VivoBook 15 pho thong, Core i3-1215U, 8GB, SSD 256GB. Man 15.6 FHD.' },
  { id: 'PROD_125', name: 'Asus ROG Strix G16 G614JU Core i7 16GB 512GB RTX 4050', cat: 'CAT_001', price: 31_990_000, desc: 'Asus ROG Strix G16, Core i7-13650HX, RTX 4050 6GB, 16GB DDR5, SSD 512GB, 16 inch FHD+ 165Hz.' },
  { id: 'PROD_126', name: 'Asus TUF Gaming A15 FA507NU Ryzen 7 16GB 512GB RTX 4050', cat: 'CAT_001', price: 24_990_000, desc: 'Asus TUF A15 gaming, Ryzen 7 7735HS, RTX 4050 6GB, 16GB, SSD 512GB, 15.6 FHD 144Hz.' },
  { id: 'PROD_127', name: 'Acer Aspire 5 A515-58M Core i5 8GB 512GB', cat: 'CAT_001', price: 14_990_000, desc: 'Acer Aspire 5 pho thong, Core i5-1335U, 8GB, SSD 512GB, 15.6 FHD IPS.' },
  { id: 'PROD_128', name: 'Acer Swift Go 14 SFG14-71 Core Ultra 5 16GB 512GB', cat: 'CAT_001', price: 22_990_000, desc: 'Acer Swift Go 14, Core Ultra 5 125H, 16GB, SSD 512GB, 14 inch 2.8K OLED.' },
  { id: 'PROD_129', name: 'Acer Predator Helios 16 PH16-71 Core i7 16GB 1TB RTX 4060', cat: 'CAT_001', price: 39_990_000, desc: 'Acer Predator Helios 16, Core i7-13700HX, RTX 4060 8GB, 16GB, SSD 1TB, 16 inch WQXGA 240Hz.' },
  { id: 'PROD_130', name: 'MSI Thin 15 B13UC Core i5 16GB 512GB RTX 3050', cat: 'CAT_001', price: 18_990_000, desc: 'MSI Thin 15, Core i5-13420H, RTX 3050 4GB, 16GB, SSD 512GB, 15.6 FHD 144Hz.' },
  { id: 'PROD_131', name: 'MSI Katana 15 B13VGK Core i7 16GB 1TB RTX 4070', cat: 'CAT_001', price: 32_990_000, desc: 'MSI Katana 15 gaming, Core i7-13620H, RTX 4070 8GB, 16GB, SSD 1TB, 15.6 FHD 144Hz.' },
  { id: 'PROD_132', name: 'LG Gram 16Z90R Core Ultra 7 16GB 1TB', cat: 'CAT_001', price: 39_990_000, desc: 'LG Gram 16, Core Ultra 7 155H, 16GB, SSD 1TB, 16 inch WQXGA, nhe 1.2kg.' },
  { id: 'PROD_133', name: 'Gigabyte Aorus 15 BSF Core i7 16GB 1TB RTX 4070', cat: 'CAT_001', price: 35_990_000, desc: 'Gigabyte Aorus 15, Core i7-13700H, RTX 4070 8GB, 16GB, SSD 1TB, 15.6 QHD 240Hz.' },
  { id: 'PROD_134', name: 'Razer Blade 14 Ryzen 9 16GB 1TB RTX 4060', cat: 'CAT_001', price: 49_990_000, desc: 'Razer Blade 14 gaming mong, Ryzen 9 7940HS, RTX 4060 8GB, 16GB, SSD 1TB, 14 QHD 240Hz.' },
  { id: 'PROD_135', name: 'Framework Laptop 13 Ryzen 5 16GB 512GB', cat: 'CAT_001', price: 19_990_000, desc: 'Framework Laptop 13, Ryzen 5 7530U, 16GB, SSD 512GB. Thiet ke module, de nang cap.' },
  { id: 'PROD_136', name: 'Microsoft Surface Laptop 5 13 Core i5 8GB 256GB', cat: 'CAT_001', price: 21_990_000, desc: 'Microsoft Surface Laptop 5 13.5 inch cam ung, Core i5-1235U, 8GB, SSD 256GB.' },
  { id: 'PROD_137', name: 'Microsoft Surface Pro 9 Core i5 8GB 256GB', cat: 'CAT_001', price: 23_990_000, desc: 'Microsoft Surface Pro 9 2-in-1, Core i5-1235U, 8GB, SSD 256GB. Man 13 PixelSense cam ung.' },

  // === Dien thoai (CAT_002) === 26 san pham, gia 3-35 trieu
  { id: 'PROD_138', name: 'iPhone 15 128GB', cat: 'CAT_002', price: 19_990_000, desc: 'Apple iPhone 15 chip A16 Bionic, 6.1 inch Super Retina XDR, camera 48MP, USB-C, Dynamic Island.' },
  { id: 'PROD_139', name: 'iPhone 15 Plus 128GB', cat: 'CAT_002', price: 22_990_000, desc: 'iPhone 15 Plus 6.7 inch, A16 Bionic, camera 48MP, pin 26h xem video.' },
  { id: 'PROD_140', name: 'iPhone 15 Pro 256GB', cat: 'CAT_002', price: 28_990_000, desc: 'iPhone 15 Pro titanium, A17 Pro, 6.1 inch ProMotion 120Hz, camera 48MP telephoto, USB-C 3.0.' },
  { id: 'PROD_141', name: 'iPhone 15 Pro Max 256GB', cat: 'CAT_002', price: 32_990_000, desc: 'iPhone 15 Pro Max 6.7 inch, A17 Pro, camera 48MP telephoto 5x, Action Button, USB-C 3.0.' },
  { id: 'PROD_142', name: 'iPhone 14 128GB', cat: 'CAT_002', price: 16_990_000, desc: 'iPhone 14 chip A15 Bionic, 6.1 inch, camera 12MP, 5G, Face ID.' },
  { id: 'PROD_143', name: 'Samsung Galaxy S24 8GB 128GB', cat: 'CAT_002', price: 16_990_000, desc: 'Samsung Galaxy S24, Exynos 2400, 6.2 inch FHD+ 120Hz, camera 50MP, AI Galaxy.' },
  { id: 'PROD_144', name: 'Samsung Galaxy S24 Plus 8GB 256GB', cat: 'CAT_002', price: 20_990_000, desc: 'Samsung Galaxy S24+ 6.7 inch QHD+ 120Hz, Exynos 2400, camera 50MP, pin 4900mAh.' },
  { id: 'PROD_145', name: 'Samsung Galaxy S24 Ultra 12GB 256GB', cat: 'CAT_002', price: 28_990_000, desc: 'Samsung Galaxy S24 Ultra, Snapdragon 8 Gen 3, 6.8 inch QHD+ 120Hz, S Pen, camera 200MP.' },
  { id: 'PROD_146', name: 'Samsung Galaxy A55 5G 8GB 128GB', cat: 'CAT_002', price: 8_990_000, desc: 'Samsung Galaxy A55 5G, Exynos 1480, 6.6 inch FHD+ 120Hz, camera 50MP.' },
  { id: 'PROD_147', name: 'Samsung Galaxy A15 5G 8GB 128GB', cat: 'CAT_002', price: 4_490_000, desc: 'Samsung Galaxy A15 5G, MediaTek Dimensity 6100+, 6.5 inch 90Hz, camera 50MP.' },
  { id: 'PROD_148', name: 'Xiaomi 14 12GB 256GB', cat: 'CAT_002', price: 14_990_000, desc: 'Xiaomi 14, Snapdragon 8 Gen 3, 6.36 inch LTPO 120Hz, camera Leica 50MP.' },
  { id: 'PROD_149', name: 'Xiaomi 14 Ultra 16GB 512GB', cat: 'CAT_002', price: 24_990_000, desc: 'Xiaomi 14 Ultra, Snapdragon 8 Gen 3, camera Leica 4 lens, 6.73 inch LTPO 120Hz.' },
  { id: 'PROD_150', name: 'Xiaomi Redmi Note 13 Pro 5G 8GB 256GB', cat: 'CAT_002', price: 6_490_000, desc: 'Xiaomi Redmi Note 13 Pro 5G, Snapdragon 7s Gen 2, 6.67 inch 120Hz, camera 200MP.' },
  { id: 'PROD_151', name: 'Xiaomi Redmi 13 6GB 128GB', cat: 'CAT_002', price: 3_290_000, desc: 'Xiaomi Redmi 13 pho thong, MediaTek Helio G91, 6.79 inch 90Hz, camera 108MP.' },
  { id: 'PROD_152', name: 'Oppo Reno 11 5G 12GB 256GB', cat: 'CAT_002', price: 8_990_000, desc: 'Oppo Reno 11 5G, Dimensity 8200, 6.7 inch AMOLED 120Hz, camera 50MP telephoto.' },
  { id: 'PROD_153', name: 'Oppo Find X7 Ultra 16GB 512GB', cat: 'CAT_002', price: 24_990_000, desc: 'Oppo Find X7 Ultra camera Hasselblad, Snapdragon 8 Gen 3, 6.82 inch LTPO 120Hz.' },
  { id: 'PROD_154', name: 'Vivo V30 5G 12GB 256GB', cat: 'CAT_002', price: 9_990_000, desc: 'Vivo V30 5G, Snapdragon 7 Gen 3, 6.78 inch AMOLED 120Hz, camera 50MP.' },
  { id: 'PROD_155', name: 'Realme 12 Pro+ 5G 8GB 256GB', cat: 'CAT_002', price: 8_490_000, desc: 'Realme 12 Pro+ 5G, Snapdragon 7s Gen 2, 6.7 inch OLED 120Hz, camera tele 64MP.' },
  { id: 'PROD_156', name: 'Google Pixel 8 8GB 128GB', cat: 'CAT_002', price: 12_990_000, desc: 'Google Pixel 8, Tensor G3, 6.2 inch OLED 120Hz, camera 50MP, Android nguyen ban.' },
  { id: 'PROD_157', name: 'Google Pixel 8 Pro 12GB 256GB', cat: 'CAT_002', price: 19_990_000, desc: 'Google Pixel 8 Pro, Tensor G3, 6.7 inch LTPO 120Hz, camera 50MP, tele 5x.' },
  { id: 'PROD_158', name: 'Nothing Phone (2) 12GB 256GB', cat: 'CAT_002', price: 13_490_000, desc: 'Nothing Phone (2) Glyph Interface, Snapdragon 8+ Gen 1, 6.7 inch LTPO 120Hz.' },
  { id: 'PROD_159', name: 'Sony Xperia 10 VI 6GB 128GB', cat: 'CAT_002', price: 7_990_000, desc: 'Sony Xperia 10 VI, Snapdragon 6 Gen 1, 6.1 inch OLED 21:9, nhe 164g.' },
  { id: 'PROD_160', name: 'Honor 200 Pro 12GB 512GB', cat: 'CAT_002', price: 12_990_000, desc: 'Honor 200 Pro, Snapdragon 8s Gen 3, 6.78 inch AMOLED 120Hz, camera 50MP.' },
  { id: 'PROD_161', name: 'Asus ROG Phone 8 Pro 16GB 512GB', cat: 'CAT_002', price: 22_990_000, desc: 'Asus ROG Phone 8 Pro gaming, Snapdragon 8 Gen 3, 6.78 inch LTPO 165Hz, pin 5500mAh, AirTriggers.' },
  { id: 'PROD_162', name: 'Nokia G42 5G 6GB 128GB', cat: 'CAT_002', price: 3_990_000, desc: 'Nokia G42 5G, Snapdragon 480+, 6.56 inch 90Hz, Android One, 3 nam cap nhat.' },
  { id: 'PROD_163', name: 'Motorola Edge 50 Fusion 12GB 256GB', cat: 'CAT_002', price: 8_990_000, desc: 'Motorola Edge 50 Fusion, Snapdragon 7s Gen 2, 6.7 inch pOLED 144Hz.' },

  // === Am thanh (CAT_003) === 22 san pham, gia 0.2-12 trieu
  { id: 'PROD_164', name: 'Apple AirPods 4', cat: 'CAT_003', price: 3_490_000, desc: 'Apple AirPods 4 chip H2, mic thuy am chat luong, sac USB-C, khang nuoc IPX4.' },
  { id: 'PROD_165', name: 'Apple AirPods Pro 2 USB-C', cat: 'CAT_003', price: 5_990_000, desc: 'Apple AirPods Pro 2 chip H2, chong on chu dong Adaptive Audio, USB-C, IP54.' },
  { id: 'PROD_166', name: 'Apple AirPods Max', cat: 'CAT_003', price: 13_990_000, desc: 'Apple AirPods Max over-ear, chip H1, chong on chu dong, Audio Spatial, USB-C.' },
  { id: 'PROD_167', name: 'Sony WF-1000XM5', cat: 'CAT_003', price: 7_290_000, desc: 'Sony WF-1000XM5 true wireless, chong on chu dong, LDAC, 6 mic cho call.' },
  { id: 'PROD_168', name: 'Sony WH-1000XM5', cat: 'CAT_003', price: 9_990_000, desc: 'Sony WH-1000XM5 over-ear, chong on hang dau, 30h pin, LDAC.' },
  { id: 'PROD_169', name: 'Bose QuietComfort Ultra Earbuds', cat: 'CAT_003', price: 8_290_000, desc: 'Bose QC Ultra Earbuds, chong on chu dong, Immersive Audio, 6h pin.' },
  { id: 'PROD_170', name: 'Bose QuietComfort Ultra Headphones', cat: 'CAT_003', price: 11_290_000, desc: 'Bose QC Ultra over-ear, chong on, Immersive Audio, 24h pin.' },
  { id: 'PROD_171', name: 'Sennheiser Momentum 4 Wireless', cat: 'CAT_003', price: 8_490_000, desc: 'Sennheiser Momentum 4 over-ear, 60h pin, aptX Adaptive, USB-C.' },
  { id: 'PROD_172', name: 'JBL Tune 770NC', cat: 'CAT_003', price: 1_990_000, desc: 'JBL Tune 770NC over-ear, chong on chu dong, 70h pin, multi-point.' },
  { id: 'PROD_173', name: 'JBL Live Pro 2 TWS', cat: 'CAT_003', price: 2_490_000, desc: 'JBL Live Pro 2 true wireless, adaptive noise cancelling, 40h pin voi case.' },
  { id: 'PROD_174', name: 'JBL Charge 5', cat: 'CAT_003', price: 3_990_000, desc: 'Loa di dong JBL Charge 5 Bluetooth, IP67, 20h pin, co the sac nhu pin du phong.' },
  { id: 'PROD_175', name: 'JBL Flip 6', cat: 'CAT_003', price: 2_490_000, desc: 'Loa di dong JBL Flip 6, IP67, 12h pin, am thanh 2 chieu.' },
  { id: 'PROD_176', name: 'Marshall Acton III', cat: 'CAT_003', price: 6_990_000, desc: 'Loa Marshall Acton III Bluetooth, thiet ke co dien, dynamic loudness, multi-host.' },
  { id: 'PROD_177', name: 'Marshall Stanmore III', cat: 'CAT_003', price: 9_490_000, desc: 'Loa Marshall Stanmore III Bluetooth, 80W, RCA, HDMI.' },
  { id: 'PROD_178', name: 'Bang & Olufsen Beoplay EX', cat: 'CAT_003', price: 7_990_000, desc: 'B&O Beoplay EX true wireless, adaptive ANC, sac khong day, 6h pin.' },
  { id: 'PROD_179', name: 'Beats Studio Pro', cat: 'CAT_003', price: 7_490_000, desc: 'Beats Studio Pro over-ear, ANC, Lossless Audio qua USB-C, 40h pin.' },
  { id: 'PROD_180', name: 'Beats Fit Pro', cat: 'CAT_003', price: 4_990_000, desc: 'Beats Fit Pro true wireless, ANC, H1 chip, IPX4, 6h pin.' },
  { id: 'PROD_181', name: 'Anker Soundcore Liberty 4 Pro', cat: 'CAT_003', price: 2_290_000, desc: 'Anker Liberty 4 Pro, ANC, 10h pin (40h voi case), LDAC.' },
  { id: 'PROD_182', name: 'Anker Soundcore Motion Boom Plus', cat: 'CAT_003', price: 3_290_000, desc: 'Loa di dong Anker Motion Boom Plus, 80W, IP67, 20h pin.' },
  { id: 'PROD_183', name: 'Logitech G Pro X 2 Lightspeed', cat: 'CAT_003', price: 4_990_000, desc: 'Tai nghe gaming Logitech G Pro X 2, 50mm graphene driver, Lightspeed wireless.' },
  { id: 'PROD_184', name: 'HyperX Cloud III', cat: 'CAT_003', price: 2_490_000, desc: 'HyperX Cloud III gaming, 53mm driver, 120h pin (wireless), micro detachable.' },
  { id: 'PROD_185', name: 'Rode NT-USB Mini', cat: 'CAT_003', price: 2_890_000, desc: 'Micro USB Rode NT-USB Mini cho podcast, streaming; cardioid, headphone monitor.' },

  // === Phu kien (CAT_004) === 32 san pham, gia 0.1-3.5 trieu
  { id: 'PROD_186', name: 'Logitech MX Master 3S', cat: 'CAT_004', price: 2_490_000, desc: 'Chuot Logitech MX Master 3S, sensor 8K DPI, click yeu tinh, cuon Magspeed, multi-device 3 thiet bi.' },
  { id: 'PROD_187', name: 'Logitech MX Anywhere 3S', cat: 'CAT_004', price: 1_790_000, desc: 'Chuot Logitech MX Anywhere 3S compact, 8K DPI, multi-device, 70 ngay pin.' },
  { id: 'PROD_188', name: 'Logitech G Pro X Superlight 2', cat: 'CAT_004', price: 3_490_000, desc: 'Chuot gaming Logitech G Pro X Superlight 2, nhe 60g, sensor HERO 2, 95h pin.' },
  { id: 'PROD_189', name: 'Logitech G502 X Plus', cat: 'CAT_004', price: 2_890_000, desc: 'Chuot gaming Logitech G502 X Plus, Lightspeed, Lightsync RGB, 13 nut co the custom.' },
  { id: 'PROD_190', name: 'Razer DeathAdder V3 Pro', cat: 'CAT_004', price: 3_290_000, desc: 'Chuot gaming Razer DeathAdder V3 Pro, Focus Pro 30K, 63g, 90h pin.' },
  { id: 'PROD_191', name: 'Razer Basilisk V3 Pro', cat: 'CAT_004', price: 3_490_000, desc: 'Chuot gaming Razer Basilisk V3 Pro, 11 nut, Focus Pro 30K, hyperscroll.' },
  { id: 'PROD_192', name: 'Logitech MX Keys S', cat: 'CAT_004', price: 2_990_000, desc: 'Ban phim Logitech MX Keys S wireless, backlit thong minh, USB-C, multi-device.' },
  { id: 'PROD_193', name: 'Logitech MX Mechanical Mini', cat: 'CAT_004', price: 2_490_000, desc: 'Ban phim co Logitech MX Mechanical Mini, switch tactile, USB-C, backlit.' },
  { id: 'PROD_194', name: 'Logitech K380', cat: 'CAT_004', price: 690_000, desc: 'Ban phim Logitech K380 Bluetooth, compact, multi-device 3, 24 thang pin.' },
  { id: 'PROD_195', name: 'Apple Magic Keyboard with Touch ID', cat: 'CAT_004', price: 2_990_000, desc: 'Apple Magic Keyboard co Touch ID cho Mac, Lightning, layout Tieng Anh.' },
  { id: 'PROD_196', name: 'Razer BlackWidow V4 Pro', cat: 'CAT_004', price: 5_290_000, desc: 'Ban phim co Razer BlackWidow V4 Pro, switch Green tactile, RGB Chroma, wrist rest.' },
  { id: 'PROD_197', name: 'Keychron K2 V2 Brown Switch', cat: 'CAT_004', price: 1_790_000, desc: 'Ban phim co Keychron K2 V2 75% wireless, Gateron Brown switch, QMK/VIA, hot-swap.' },
  { id: 'PROD_198', name: 'Keychron Q1 Pro QMK/VIA', cat: 'CAT_004', price: 3_990_000, desc: 'Keychron Q1 Pro 75% aluminum, QMK/VIA, Gateron G Pro switch, double-gasket.' },
  { id: 'PROD_199', name: 'Anker 737 GaNPrime 120W', cat: 'CAT_004', price: 1_590_000, desc: 'Sac nhanh Anker 737 GaNPrime 120W, 2 USB-C + 1 USB-A, PowerIQ 4.0.' },
  { id: 'PROD_200', name: 'Anker 747 Charger 150W', cat: 'CAT_004', price: 1_990_000, desc: 'Sac nhanh Anker 747 150W, 4 cong (3 USB-C + 1 USB-A), GaN tech.' },
  { id: 'PROD_201', name: 'Apple 20W USB-C Power Adapter', cat: 'CAT_004', price: 590_000, desc: 'Adapter Apple 20W USB-C cho iPhone/iPad.' },
  { id: 'PROD_202', name: 'Ugreen 100W GaN Charger', cat: 'CAT_004', price: 1_290_000, desc: 'Ugreen 100W GaN 4 port (3 USB-C + 1 USB-A), Power Delivery 3.0.' },
  { id: 'PROD_203', name: 'Ugreen Nexode 20000mAh 100W', cat: 'CAT_004', price: 1_790_000, desc: 'Pin du phong Ugreen Nexode 20000mAh 100W, 2 USB-C + 1 USB-A, IPS screen.' },
  { id: 'PROD_204', name: 'Anker PowerCore 20000mAh 15W', cat: 'CAT_004', price: 790_000, desc: 'Pin du phong Anker PowerCore 20000, 2 USB-A, 15W output.' },
  { id: 'PROD_205', name: 'Anker USB-C to USB-C 100W 2m', cat: 'CAT_004', price: 290_000, desc: 'Cap Anker USB-C 100W 2m, e-marker, do ben 35.000 lan gap.' },
  { id: 'PROD_206', name: 'Apple USB-C to Lightning 1m', cat: 'CAT_004', price: 490_000, desc: 'Cap Apple USB-C to Lightning 1m cho iPhone 14 va truoc.' },
  { id: 'PROD_207', name: 'Belkin BoostCharge Pro 3-in-1', cat: 'CAT_004', price: 2_290_000, desc: 'De sac khong day Belkin BoostCharge Pro 3-in-1 cho iPhone + Watch + AirPods.' },
  { id: 'PROD_208', name: 'Anker 543 USB-C Hub 7-in-1', cat: 'CAT_004', price: 990_000, desc: 'Hub Anker 543 USB-C 7-in-1: HDMI 4K, 2 USB-A 3.0, USB-C PD, SD/microSD.' },
  { id: 'PROD_209', name: 'Ugreen 9-in-1 USB-C Hub', cat: 'CAT_004', price: 1_290_000, desc: 'Ugreen 9-in-1 USB-C Hub: HDMI 4K@60, 3 USB 3.0, Ethernet, SD/TF, PD 100W.' },
  { id: 'PROD_210', name: 'Logitech Brio 4K Webcam', cat: 'CAT_004', price: 4_290_000, desc: 'Webcam Logitech Brio 4K Ultra HD, HDR, Windows Hello, mic stereo.' },
  { id: 'PROD_211', name: 'Logitech C920s Pro HD Webcam', cat: 'CAT_004', price: 1_990_000, desc: 'Webcam Logitech C920s Pro, 1080p, autofocus, mic stereo, privacy shutter.' },
  { id: 'PROD_212', name: 'Elgato Stream Deck MK.2', cat: 'CAT_004', price: 2_990_000, desc: 'Elgato Stream Deck MK.2, 15 LCD key, plugin streaming/Office.' },
  { id: 'PROD_213', name: 'Wacom Intuos Pro M', cat: 'CAT_004', price: 5_990_000, desc: 'Bang ve Wacom Intuos Pro M, Pro Pen 3, multi-touch, Bluetooth.' },
  { id: 'PROD_214', name: 'Logitech Pebble M750', cat: 'CAT_004', price: 590_000, desc: 'Chuot Logitech Pebble M750 Bluetooth, im lang, 24 thang pin.' },
  { id: 'PROD_215', name: 'Logitech Lift Vertical Ergonomic', cat: 'CAT_004', price: 1_790_000, desc: 'Chuot Logitech Lift Vertical ergonomic 57 do, giam met tay.' },
  { id: 'PROD_216', name: 'Logitech G733 Lightspeed Wireless', cat: 'CAT_004', price: 3_490_000, desc: 'Tai nghe gaming Logitech G733 Lightspeed, Blue VO!CE mic, 29h pin, RGB Lightsync.' },
  { id: 'PROD_217', name: 'Razer Huntsman Mini Analog', cat: 'CAT_004', price: 2_290_000, desc: 'Ban phim co Razer Huntsman Mini 60% Analog optical switch, RGB.' },

  // === Dong ho thong minh (CAT_005) === 18 san pham, gia 0.4-19 trieu
  { id: 'PROD_218', name: 'Apple Watch Series 9 GPS 41mm', cat: 'CAT_005', price: 9_990_000, desc: 'Apple Watch S9 chip S9, 41mm, GPS, man hinh 2000 nit, Double Tap.' },
  { id: 'PROD_219', name: 'Apple Watch Series 9 GPS 45mm', cat: 'CAT_005', price: 10_990_000, desc: 'Apple Watch S9 45mm GPS, man hinh Retina 2000 nit, theo doi suc khoe.' },
  { id: 'PROD_220', name: 'Apple Watch Ultra 2 GPS + Cellular 49mm', cat: 'CAT_005', price: 19_990_000, desc: 'Apple Watch Ultra 2 titanium 49mm, GPS + Cellular, 36h pin (72h Low Power), 3000 nit.' },
  { id: 'PROD_221', name: 'Apple Watch SE 2 GPS 40mm', cat: 'CAT_005', price: 5_990_000, desc: 'Apple Watch SE 2 chip S8, 40mm, GPS, watchOS 10, phu hop the thao.' },
  { id: 'PROD_222', name: 'Samsung Galaxy Watch 6 40mm BT', cat: 'CAT_005', price: 5_990_000, desc: 'Samsung Galaxy Watch 6 40mm, Exynos W930, AMOLED, Wear OS 4, body composition.' },
  { id: 'PROD_223', name: 'Samsung Galaxy Watch 6 Classic 47mm BT', cat: 'CAT_005', price: 8_490_000, desc: 'Samsung Galaxy Watch 6 Classic 47mm bezel xoay, AMOLED, Wear OS 4.' },
  { id: 'PROD_224', name: 'Samsung Galaxy Watch Ultra 47mm LTE', cat: 'CAT_005', price: 14_990_000, desc: 'Samsung Galaxy Watch Ultra titanium 47mm, LTE, pin 590mAh, GPS dual-band.' },
  { id: 'PROD_225', name: 'Garmin Venu 3', cat: 'CAT_005', price: 9_990_000, desc: 'Garmin Venu 3 AMOLED, GPS, theo doi giac ngu, 14 ngay pin.' },
  { id: 'PROD_226', name: 'Garmin Forerunner 265', cat: 'CAT_005', price: 11_990_000, desc: 'Garmin Forerunner 265 AMOLED, GPS multi-band, training metrics, 13h pin.' },
  { id: 'PROD_227', name: 'Garmin Fenix 7 Solar', cat: 'CAT_005', price: 19_990_000, desc: 'Garmin Fenix 7 Solar, 22 ngay pin, solar charging, GPS multi-band.' },
  { id: 'PROD_228', name: 'Fitbit Charge 6', cat: 'CAT_005', price: 3_990_000, desc: 'Fitbit Charge 6 GPS, theo doi nhip tim, ECG, 7 ngay pin.' },
  { id: 'PROD_229', name: 'Fitbit Sense 2', cat: 'CAT_005', price: 6_990_000, desc: 'Fitbit Sense 2 ECG, EDA stress sensor, AMOLED, 6 ngay pin.' },
  { id: 'PROD_230', name: 'Google Pixel Watch 2 Wi-Fi', cat: 'CAT_005', price: 8_490_000, desc: 'Google Pixel Watch 2 chip Qualcomm 5100, AMOLED 1000 nit, Wear OS 4.' },
  { id: 'PROD_231', name: 'Xiaomi Mi Band 8 Pro', cat: 'CAT_005', price: 1_490_000, desc: 'Xiaomi Mi Band 8 Pro AMOLED 1.74 inch, GPS, 14 ngay pin, 5ATM.' },
  { id: 'PROD_232', name: 'Huawei Watch GT 4 46mm', cat: 'CAT_005', price: 4_990_000, desc: 'Huawei Watch GT 4 46mm AMOLED, 14 ngay pin, GPS dual-band, theo doi giac ngu.' },
  { id: 'PROD_233', name: 'Amazfit GTR 4', cat: 'CAT_005', price: 3_490_000, desc: 'Amazfit GTR 4 AMOLED 1.43 inch, 14 ngay pin, GPS, 150+ workout modes.' },
  { id: 'PROD_234', name: 'Suunto Race', cat: 'CAT_005', price: 9_990_000, desc: 'Suunto Race AMOLED, GPS dual-band, training mode, 40h pin.' },
  { id: 'PROD_235', name: 'Polar Vantage V3', cat: 'CAT_005', price: 14_990_000, desc: 'Polar Vantage V3 AMOLED, GPS dual-band, training load, 140+ sport.' },

  // === May tinh vi (CAT_006) === 20 san pham, gia 4-35 trieu
  { id: 'PROD_236', name: 'iPad Air 11 inch M2 128GB WiFi', cat: 'CAT_006', price: 16_990_000, desc: 'Apple iPad Air M2 11 inch Liquid Retina, 128GB, WiFi 6E, Apple Pencil Pro.' },
  { id: 'PROD_237', name: 'iPad Air 13 inch M2 256GB WiFi', cat: 'CAT_006', price: 21_990_000, desc: 'iPad Air M2 13 inch, 256GB, WiFi 6E, Apple Pencil Pro support.' },
  { id: 'PROD_238', name: 'iPad Pro 11 inch M4 256GB WiFi', cat: 'CAT_006', price: 26_990_000, desc: 'iPad Pro 11 inch M4, Ultra Retina XDR, 256GB, Apple Pencil Pro.' },
  { id: 'PROD_239', name: 'iPad Pro 13 inch M4 512GB WiFi', cat: 'CAT_006', price: 36_990_000, desc: 'iPad Pro 13 inch M4 chip M4, Ultra Retina XDR tandem OLED 1000 nit, 512GB.' },
  { id: 'PROD_240', name: 'iPad Gen 10 64GB WiFi', cat: 'CAT_006', price: 9_990_000, desc: 'iPad Gen 10 A14 Bionic, 10.9 inch Liquid Retina, 64GB, USB-C.' },
  { id: 'PROD_241', name: 'iPad Mini 6 64GB WiFi', cat: 'CAT_006', price: 11_490_000, desc: 'iPad Mini 6 A15 Bionic, 8.3 inch Liquid Retina, 64GB, Apple Pencil 2.' },
  { id: 'PROD_242', name: 'Samsung Galaxy Tab S9 11 inch 128GB', cat: 'CAT_006', price: 14_990_000, desc: 'Samsung Galaxy Tab S9 Snapdragon 8 Gen 2, 11 inch Dynamic AMOLED 2X 120Hz, 128GB, S Pen.' },
  { id: 'PROD_243', name: 'Samsung Galaxy Tab S9+ 12.4 inch 256GB', cat: 'CAT_006', price: 19_990_000, desc: 'Samsung Galaxy Tab S9+ 12.4 inch AMOLED 120Hz, Snapdragon 8 Gen 2, 256GB.' },
  { id: 'PROD_244', name: 'Samsung Galaxy Tab S9 Ultra 14.6 inch 512GB', cat: 'CAT_006', price: 28_990_000, desc: 'Samsung Galaxy Tab S9 Ultra 14.6 inch AMOLED, Snapdragon 8 Gen 2, 512GB, S Pen.' },
  { id: 'PROD_245', name: 'Samsung Galaxy Tab A9+ 11 inch 64GB', cat: 'CAT_006', price: 5_990_000, desc: 'Samsung Galaxy Tab A9+ 11 inch FHD+, Snapdragon 695, 64GB.' },
  { id: 'PROD_246', name: 'Xiaomi Pad 6 11 inch 128GB', cat: 'CAT_006', price: 7_990_000, desc: 'Xiaomi Pad 6 Snapdragon 870, 11 inch 2.8K 144Hz, 128GB, Dolby Vision.' },
  { id: 'PROD_247', name: 'Xiaomi Pad 6 Pro 11 inch 256GB', cat: 'CAT_006', price: 10_990_000, desc: 'Xiaomi Pad 6 Pro Snapdragon 8+ Gen 1, 11 inch 2.8K 144Hz, 256GB, 67W sac nhanh.' },
  { id: 'PROD_248', name: 'Lenovo Tab P12 12.7 inch 128GB', cat: 'CAT_006', price: 9_490_000, desc: 'Lenovo Tab P12 12.7 inch 3K, MediaTek Dimensity 7050, 128GB, pin 10200mAh.' },
  { id: 'PROD_249', name: 'Lenovo Tab M11 11 inch 128GB', cat: 'CAT_006', price: 5_490_000, desc: 'Lenovo Tab M11 11 inch FHD, MediaTek Helio G88, 128GB.' },
  { id: 'PROD_250', name: 'Huawei MatePad 11.5 128GB', cat: 'CAT_006', price: 7_490_000, desc: 'Huawei MatePad 11.5 Snapdragon 7 Gen 1, 11.5 inch 2.8K 120Hz, 128GB, HarmonyOS.' },
  { id: 'PROD_251', name: 'Apple Magic Keyboard for iPad Pro 11', cat: 'CAT_006', price: 6_990_000, desc: 'Apple Magic Keyboard cho iPad Pro 11 inch, USB-C pass-through, backlit.' },
  { id: 'PROD_252', name: 'Apple Pencil Pro', cat: 'CAT_006', price: 3_490_000, desc: 'Apple Pencil Pro, Squeeze, Barrel Roll, Find My, chi dung cho iPad Pro M4 + Air M2.' },
  { id: 'PROD_253', name: 'Samsung S Pen Creator Edition', cat: 'CAT_006', price: 1_290_000, desc: 'Samsung S Pen Creator Edition, thiet ke moi, but to, nhay nhu but that.' },
  { id: 'PROD_254', name: 'Logitech Combo Touch iPad Air 11', cat: 'CAT_006', price: 3_990_000, desc: 'Logitech Combo Touch cho iPad Air 11, ban phim thao roil, trackpad.' },
  { id: 'PROD_255', name: 'Boox Tab Ultra C Pro 10.3 inch', cat: 'CAT_006', price: 14_990_000, desc: 'Boox Tab Ultra C Pro 10.3 inch E-Ink Carta 1200 mau, pen Wacom, Android 12.' },
];

// Helper: slugify ten san pham thanh filename
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Sinh danh sach 150 product V2 tu RAW. Moi product co:
 *  - businessId (PROD_106..PROD_255)
 *  - name (tieng Viet co dau, theo brand + model)
 *  - description (tieng Viet, 2-4 cau)
 *  - price (VND)
 *  - imageUrl (local /images/products/{businessId}-{slug}.svg - placeholder V2)
 *  - active: true
 *  - categoryId (mapping tu cat)
 *  - datasetTag: V2_MARKER
 *  - catalogVersion: 'V2'
 *  - slug (filename-friendly)
 */
export function generateCatalogV2() {
  return RAW.map((p) => ({
    productId: p.id,
    name: p.name,
    description: p.desc,
    price: p.price,
    imageUrl: `/images/products/${p.id.toLowerCase()}-${slugify(p.name)}.svg`,
    active: true,
    categoryId: p.cat,
    datasetTag: V2_MARKER,
    catalogVersion: 'V2',
    slug: slugify(p.name),
  }));
}

export const CATALOG_V2_MARKER = V2_MARKER;
export const CATALOG_V2_COUNT = RAW.length;

export const PERSONAS = {
  Gaming: { count: 12, historyMin: 2, historyMax: 3, historyBias: 'short' },
  'Van phong': { count: 12, historyMin: 3, historyMax: 6, historyBias: 'medium' },
  'Sinh vien': { count: 10, historyMin: 1, historyMax: 4, historyBias: 'thin' },
  'Sang tao noi dung': { count: 10, historyMin: 4, historyMax: 8, historyBias: 'medium' },
  'Di dong': { count: 8, historyMin: 2, historyMax: 5, historyBias: 'medium' },
  'Am thanh': { count: 8, historyMin: 2, historyMax: 4, historyBias: 'short' },
  'Mang gia dinh': { count: 8, historyMin: 2, historyMax: 4, historyBias: 'short' },
  'Hon hop': { count: 6, historyMin: 12, historyMax: 18, historyBias: 'long' },
  'Cold start': { count: 4, historyMin: 0, historyMax: 0, historyBias: 'none' },
};

export const PERSONA_CATEGORY_BIAS = {
  Gaming: ['CAT_001', 'CAT_003', 'CAT_004', 'CAT_006'],
  'Van phong': ['CAT_001', 'CAT_004', 'CAT_006'],
  'Sinh vien': ['CAT_001', 'CAT_002', 'CAT_004', 'CAT_006'],
  'Sang tao noi dung': ['CAT_001', 'CAT_003', 'CAT_004', 'CAT_006'],
  'Di dong': ['CAT_002', 'CAT_003', 'CAT_005'],
  'Am thanh': ['CAT_003'],
  'Mang gia dinh': ['CAT_001', 'CAT_004'],
  'Hon hop': ['CAT_001', 'CAT_002', 'CAT_003', 'CAT_004', 'CAT_005', 'CAT_006'],
  'Cold start': [],
};
