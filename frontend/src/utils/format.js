// VND formatter: 1500000 -> "1.500.000".
export function formatVnd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('vi-VN');
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
  const rawName = (user.name || '').trim();

  if (/^Quan tri DT13$/i.test(rawName)) return 'Quản trị viên DT13';
  if (/^Quan tri/i.test(rawName)) return 'Quản trị viên';

  const matchKhach = rawName.match(/^Khach hang\s*(\d+)$/i);
  if (matchKhach) return `Khách hàng ${matchKhach[1]}`;

  if (/^Khach hang$/i.test(rawName)) return 'Khách hàng';

  if (rawName) return rawName;

  if (user.role === 'admin') return 'Quản trị viên';
  if (user.customerId) {
    const idNum = user.customerId.replace(/\D/g, '');
    if (idNum) return `Khách hàng ${Number(idNum)}`;
    return `Khách hàng (${user.customerId})`;
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
      : 'Gợi ý sản phẩm thường được mua kèm cùng sản phẩm này trên đồ thị giao dịch.';
  }

  const clean = reason.trim();

  if (/Goi y tu lich su mua va nhung nguoi co san pham mua chung/i.test(clean)) {
    return 'Gợi ý thông minh dựa trên lịch sử mua sắm của bạn và các sản phẩm mà khách hàng tương đồng cùng lựa chọn.';
  }

  if (/Goi y tu lich su mua va cac san pham cung danh muc/i.test(clean)) {
    return 'Gợi ý dựa trên các sản phẩm nổi bật cùng danh mục bạn quan tâm.';
  }

  if (/Chua co du lieu/i.test(clean)) {
    return 'Chưa có đủ dữ liệu giao dịch để phân tích. Hãy mua thêm sản phẩm để nhận gợi ý chính xác hơn.';
  }

  if (/Chua co goi y/i.test(clean)) {
    return mode === 'me'
      ? 'Tài khoản chưa có lịch sử mua hàng. Hãy bắt đầu khám phá để nhận gợi ý được cá nhân hoá.'
      : 'Chưa có dữ liệu mua kèm cho sản phẩm này.';
  }

  return clean;
}
