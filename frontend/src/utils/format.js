const vndNumberFormatter = new Intl.NumberFormat('vi-VN');

// VND formatter: 1500000 -> "1.500.000".
export function formatVnd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return vndNumberFormatter.format(value);
}

// Vietnamese date-time formatter; returns '-' for null/invalid input.
export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Strip Vietnamese diacritics and lowercase. Used to normalize the search box
// input and the backend's `searchText` field so both sides match.
export function normalizeSearchText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Normalizes user display name with proper Vietnamese accents without modifying backend storage
 * @param {{ name?: string, email?: string, role?: string, customerId?: string } | null} user
 * @returns {string}
 */
export function formatUserDisplayName(user) {
  if (!user) return 'Khách';
  if (user.role === 'admin') return 'Quản trị viên';
  const rawName = (user.name || '').trim();

  if (/^Quan tri/i.test(rawName)) return 'Quản trị viên';

  const matchKhach = rawName.match(/^Khach hang\s*(\d+)$/i);
  if (matchKhach) return `Khách hàng ${matchKhach[1].padStart(2, '0')}`;

  if (/^Khach hang$/i.test(rawName)) return 'Khách hàng';

  if (rawName && !/^CUST_\d+/i.test(rawName) && !/^RC_C\d+/i.test(rawName)) {
    return rawName;
  }

  if (user.customerId) {
    const idNum = user.customerId.replace(/\D/g, '');
    if (idNum) return `Khách hàng ${idNum.padStart(2, '0')}`;
    return 'Khách hàng';
  }

  return (user.email || 'Khách').split('@')[0];
}

/**
 * Normalizes recommendation reasons to proper accented Vietnamese
 * @param {string} reason
 * @param {'me' | 'product'} [mode='me']
 * @returns {string}
 */
export function formatRecommendationReason(reason, mode = 'me') {
  if (!reason) {
    return mode === 'me'
      ? 'Gợi ý thông minh dựa trên hành vi mua sắm của những khách hàng có sở thích tương đồng với bạn.'
      : 'Gợi ý sản phẩm phù hợp dành riêng cho bạn.';
  }

  const clean = reason.trim();

  if (/Goi y tu lich su mua va nhung nguoi co san pham mua chung/i.test(clean)) {
    return 'Gợi ý thông minh dựa trên lịch sử mua sắm của bạn và các sản phẩm mà khách hàng tương đồng cùng lựa chọn.';
  }

  if (/Goi y tu cac san pham duoc mua boi nhung nguoi co tuong tac/i.test(clean)) {
    return 'Gợi ý dựa trên các sản phẩm được quan tâm bởi những khách hàng có sở thích tương đồng với bạn.';
  }

  if (/Chua co san pham phu hop/i.test(clean) || /Chua co du lieu/i.test(clean)) {
    return 'Chưa có đủ dữ liệu tương tác để gợi ý cá nhân hóa. Hãy khám phá và mua sắm để nhận gợi ý phù hợp nhất.';
  }

  return clean;
}

/**
 * Extracts up to two useful real specifications from product text.
 * Strictly uses existing name/desc text without inventing fake specs.
 */
export function extractProductSpecs(item) {
  if (!item) return [];
  const text = `${item.name || ''} ${item.description || ''}`;
  const specs = [];

  // Screen size
  const screenMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:inch|in)\b/i);
  if (screenMatch) {
    specs.push(`${screenMatch[1]} inch`);
  }

  // Chipset / CPU
  const chipMatch = text.match(/\b(M[1-4](?:\s*Pro|\s*Max)?|Snapdragon\s*[\w\s]+|Core\s*i[3579]|Ryzen\s*[3579]|Exynos\s*\d+|Dimensity\s*\d+)\b/i);
  if (chipMatch && specs.length < 2) {
    specs.push(chipMatch[1].trim());
  }

  // Storage
  const storageMatch = text.match(/\b(64GB|128GB|256GB|512GB|1TB|2TB)\b/i);
  if (storageMatch && specs.length < 2) {
    specs.push(storageMatch[1].trim());
  }

  // RAM
  const ramMatch = text.match(/\b(4GB|8GB|16GB|18GB|24GB|32GB|36GB|64GB)\s*(?:RAM)?\b/i);
  if (ramMatch && specs.length < 2 && !specs.includes(ramMatch[1].trim())) {
    specs.push(ramMatch[1].trim());
  }

  return specs.slice(0, 2);
}
