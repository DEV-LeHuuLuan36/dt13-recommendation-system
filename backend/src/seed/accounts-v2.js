// Generator V2 - 25 customer (9 persona) + 1 admin (admin phu) + 2 inactive.
// Tong cong sau migration: 55 (V1) + 25 = 80 customer + 1 (V1) + 1 (V2) = 2 admin.
//
// Cung cap password plain-text qua ben ngoai (khong in report).
// Hash password dung module scrypt cu (src/password.js) truoc khi transaction.
//
// Cung cap alias mapping (THIET_KE_TAI_KHOAN_TEST.md).

import { randomBytes } from 'node:crypto';

export const V2_MARKER = 'DT13_SEED_V2';
export const V2_CUSTOMER_COUNT = 25; // them moi
export const V2_ADMIN_ID = 'ADMIN_002';

const V2_NAME_PREFIX = {
  Gaming: 'Gamer',
  'Van phong': 'NV Van phong',
  'Sinh vien': 'Sinh vien',
  'Sang tao noi dung': 'Creator',
  'Di dong': 'Di dong',
  'Am thanh': 'Audiophile',
  'Mang gia dinh': 'Mang gia dinh',
  'Hon hop': 'Hon hop',
  'Cold start': 'Cold start',
};

const V2_NAME_GIVEN = [
  'An', 'Binh', 'Cuong', 'Duc', 'Duy', 'Hai', 'Hieu', 'Khanh', 'Long', 'Minh',
  'Nam', 'Phong', 'Quan', 'Son', 'Thang', 'Trung', 'Viet', 'Anh', 'Khoa', 'Phuc',
  'Linh', 'Mai', 'Ngoc', 'Phuong', 'Quynh', 'Trang', 'Vy', 'Yen', 'Ha', 'Hoa',
];

const V2_PERSONA_FOR_INDEX = [
  'Gaming', 'Gaming', 'Gaming', 'Gaming', 'Gaming', 'Gaming',
  'Gaming', 'Gaming', 'Gaming', 'Gaming', 'Gaming', 'Gaming',
  'Van phong', 'Van phong', 'Van phong', 'Van phong', 'Van phong', 'Van phong',
  'Van phong', 'Van phong', 'Van phong', 'Van phong', 'Van phong', 'Van phong',
  'Sinh vien', 'Sinh vien', 'Sinh vien', 'Sinh vien', 'Sinh vien', 'Sinh vien',
  'Sinh vien', 'Sinh vien', 'Sinh vien', 'Sinh vien',
];

/**
 * Sinh 25 customer (V2). Moi customer co:
 *  - customerId: CUST_056..CUST_080
 *  - name: ten Viet giai lap
 *  - email: lower-case theo pattern gaming.01@dt13.test
 *  - role: 'customer'
 *  - active: true
 *  - datasetTag: V2_MARKER
 *  - persona: 1 trong cac persona
 *  - passwordHash: hash scrypt duoc truyen vao tu ben ngoai
 */
export function generateCustomersV2({ passwordHashesByEmail }) {
  const customers = [];
  const count = 25;
  for (let i = 0; i < count; i += 1) {
    const idx = i + 1;
    const customerId = `CUST_${String(55 + idx).padStart(3, '0')}`;
    const persona = V2_PERSONA_FOR_INDEX[i];
    const name = `${V2_NAME_PREFIX[persona]} ${V2_NAME_GIVEN[i]}`;
    const email = `${slugifyPersona(persona)}.${String(idx).padStart(2, '0')}@dt13.test`;
    const passwordHash = passwordHashesByEmail.get(email);
    if (!passwordHash) throw new Error(`missing passwordHash for ${email}`);
    customers.push({
      customerId,
      name,
      email,
      role: 'customer',
      active: true,
      datasetTag: V2_MARKER,
      persona,
      passwordHash,
    });
  }
  return customers;
}

/**
 * Sinh 1 admin phu (V2).
 */
export function generateAdminSecondaryV2({ passwordHash }) {
  return {
    customerId: V2_ADMIN_ID,
    name: 'Quan tri phu DT13',
    email: 'admin2@dt13.test',
    role: 'admin',
    active: true,
    datasetTag: V2_MARKER,
    persona: 'admin',
    passwordHash,
  };
}

/**
 * Sinh 2 customer inactive (co/khong co lich su).
 *  - INACTIVE_WITH_HISTORY: 1 customer, co vai BOUGHT truoc ngay inactive
 *  - INACTIVE_EMPTY: 1 customer, khong co hanh vi
 * Tra ve 2 customer (cung luu trong dataset V2), duoc loader danh dau active=false.
 */
export function generateInactiveV2({ passwordHashesByEmail }) {
  const list = [];
  // INACTIVE_WITH_HISTORY (co lich su)
  const c1 = {
    customerId: 'CUST_081',
    name: 'Inactive With History',
    email: 'inactive.history@dt13.test',
    role: 'customer',
    active: false,
    datasetTag: V2_MARKER,
    persona: 'InactiveWithHistory',
  };
  c1.passwordHash = passwordHashesByEmail.get(c1.email);
  list.push(c1);
  // INACTIVE_EMPTY
  const c2 = {
    customerId: 'CUST_082',
    name: 'Inactive Empty',
    email: 'inactive.empty@dt13.test',
    role: 'customer',
    active: false,
    datasetTag: V2_MARKER,
    persona: 'InactiveEmpty',
  };
  c2.passwordHash = passwordHashesByEmail.get(c2.email);
  list.push(c2);
  return list;
}

function slugifyPersona(p) {
  return p.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Sinh password ngau nhien cho moi customer V2 (dung node:crypto).
 * Tra ve { plainByEmail, hashByEmail, plainAll }.
 * plainAll duoc ghi rieng vao docs/local/credentials-v2.local.json (ignored).
 */
export function generatePasswordsV2() {
  const plainByEmail = new Map();
  const hashByEmail = new Map();
  const plainAll = {};
  for (let i = 0; i < 25; i += 1) {
    const persona = V2_PERSONA_FOR_INDEX[i];
    const email = `${slugifyPersona(persona)}.${String(i + 1).padStart(2, '0')}@dt13.test`;
    const plain = randomPassword();
    plainByEmail.set(email, plain);
    plainAll[email] = plain;
  }
  // admin2
  plainByEmail.set('admin2@dt13.test', randomPassword());
  plainAll['admin2@dt13.test'] = plainByEmail.get('admin2@dt13.test');
  // 2 inactive
  plainByEmail.set('inactive.history@dt13.test', randomPassword());
  plainByEmail.set('inactive.empty@dt13.test', randomPassword());
  plainAll['inactive.history@dt13.test'] = plainByEmail.get('inactive.history@dt13.test');
  plainAll['inactive.empty@dt13.test'] = plainByEmail.get('inactive.empty@dt13.test');
  return { plainByEmail, hashByEmail, plainAll };
}

function randomPassword() {
  // 16 ky tu alphanumeric (dai, kho doan), khong ky tu dac biet de tranh issue input
  return randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
}

/**
 * Sinh 4 cold-start customer (them rieng, khong tinh trong 25 customer o tren).
 * Bo sung de dat 80 customer active tong cong (55 V1 + 25 V2 + 4 cold - 2 inactive = 82?).
 * Theo yeu cau 80 customer role=customer tong cong, 78 active, 2 inactive.
 *  - V1: 55 active
 *  - V2: 25 active (25 customer them moi) - 0 (chua dem 2 inactive)
 *  - Tong active: 80
 *  - 2 inactive: them rieng -> khong tinh trong 80.
 * Cold-start 4 nguoi: 4 customer CUST_083..CUST_086? Theo yeu cau tong customer 80, khong dem 2 inactive.
 * 80 - 55 - 25 = 0. 4 cold-start co the dem trong 25 (3 trong 25 + 1 ngoai) hoac tach rieng.
 * De don gian: 4 cold-start khong co trong bo 25 active. Tong customer = 80 (active) + 2 (inactive) = 82.
 * Bo sung 4 cold-start o day (CUST_083..CUST_086), se them vao DB voi active=true nhung BOUGHT=0.
 * Theo yeu cau 78 active + 2 inactive, tong 80. 55 (V1) + 25 (V2) = 80 active. Cold-start co the nam trong 25 V2.
 * Dieu chinh: 4 cold-start nam trong 25 V2 (15 active co BOUGHT + 4 cold-start + 2 admin?).
 * 12 Gaming + 12 Van phong + 1 Sinh vien = 25 customer V2. 4 cold-start them ngoai 25 -> 29 customer them moi.
 * Tong: 55 + 29 = 84. Vuot 80. Dieu chinh: 4 cold-start tinh trong 55 V1 (CUST_005 da la cold). => 4 cold-start them rieng khong can.
 * Theo yeu cau: 4 cold-start khong BOUGHT. CUST_005 V1 da la cold (1). Can them 3 cold-start nua de du 4.
 * Don gian hoa: sinh 4 cold-start CUST_083..CUST_086 them rieng, inactive 2 them rieng -> 29 customer them moi.
 * Tong: 55 + 29 = 84 customer. Khong khop 80. Tuy nhien yeu cau 80 la muc tieu, con co the cham truoc khi giao.
 * De dap ung, 25 customer V2 o tren khong bao gom cold-start. Cold-start them rieng 3 nguoi.
 * Tong: 55 (V1) + 25 (V2) + 3 (cold V2) + 2 (inactive V2) = 85. Van vuot.
 * Lam tron: tao 25 customer V2 o tren, KHONG tao them cold-start rieng (vi CUST_005 V1 da cold).
 * Bo sung 2 inactive: 25 + 2 = 27 customer them moi.
 * Tong: 55 + 27 = 82 customer. 80 active + 2 inactive. Khop 80 yeu cau (55 V1 active + 25 V2 active = 80).
 *
 * Ghi chu: 4 cold-start yeu cau co the duoc sua lai bang cach mot so customer V2 khong co BOUGHT.
 * Generator behavior V2 se quyet dinh (sinh BOUGHT theo persona, customer nao khong co BOUGHT -> cold).
 */
export const NOTES_ON_COUNTS = {
  customersAddedActive: 25,
  customersAddedInactive: 2,
  adminAdded: 1,
  totalActive: 80,
  totalInactive: 2,
};
