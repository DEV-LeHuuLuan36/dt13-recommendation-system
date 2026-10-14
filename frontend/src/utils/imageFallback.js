// Modern, elegant SVG illustrations & category icons for clean UI/UX without text duplication

/**
 * 120 reference catalog products image filenames in /images/products/
 */
export const RC_IMAGE_FILES = {
  rc_p001: 'rc_p001.jpg', rc_p002: 'rc_p002.png', rc_p003: 'rc_p003.png', rc_p004: 'rc_p004.png',
  rc_p005: 'rc_p005.png', rc_p006: 'rc_p006.png', rc_p007: 'rc_p007.png', rc_p008: 'rc_p008.png',
  rc_p009: 'rc_p009.png', rc_p010: 'rc_p010.png', rc_p011: 'rc_p011.jpg', rc_p012: 'rc_p012.jpg',
  rc_p013: 'rc_p013.png', rc_p014: 'rc_p014.png', rc_p015: 'rc_p015.jpg', rc_p016: 'rc_p016.png',
  rc_p017: 'rc_p017.png', rc_p018: 'rc_p018.png', rc_p019: 'rc_p019.png', rc_p020: 'rc_p020.jpg',
  rc_p021: 'rc_p021.png', rc_p022: 'rc_p022.png', rc_p023: 'rc_p023.png', rc_p024: 'rc_p024.png',
  rc_p025: 'rc_p025.png', rc_p026: 'rc_p026.png', rc_p027: 'rc_p027.png', rc_p028: 'rc_p028.png',
  rc_p029: 'rc_p029.png', rc_p030: 'rc_p030.png', rc_p031: 'rc_p031.jpg', rc_p032: 'rc_p032.jpg',
  rc_p033: 'rc_p033.jpg', rc_p034: 'rc_p034.jpg', rc_p035: 'rc_p035.jpg', rc_p036: 'rc_p036.jpg',
  rc_p037: 'rc_p037.jpg', rc_p038: 'rc_p038.jpg', rc_p039: 'rc_p039.jpg', rc_p040: 'rc_p040.jpg',
  rc_p041: 'rc_p041.png', rc_p042: 'rc_p042.png', rc_p043: 'rc_p043.png', rc_p044: 'rc_p044.png',
  rc_p045: 'rc_p045.png', rc_p046: 'rc_p046.png', rc_p047: 'rc_p047.png', rc_p048: 'rc_p048.png',
  rc_p049: 'rc_p049.png', rc_p050: 'rc_p050.png', rc_p051: 'rc_p051.png', rc_p052: 'rc_p052.png',
  rc_p053: 'rc_p053.jpg', rc_p054: 'rc_p054.jpg', rc_p055: 'rc_p055.jpg', rc_p056: 'rc_p056.jpg',
  rc_p057: 'rc_p057.jpg', rc_p058: 'rc_p058.jpg', rc_p059: 'rc_p059.jpg', rc_p060: 'rc_p060.jpg',
  rc_p061: 'rc_p061.png', rc_p062: 'rc_p062.png', rc_p063: 'rc_p063.png', rc_p064: 'rc_p064.png',
  rc_p065: 'rc_p065.png', rc_p066: 'rc_p066.png', rc_p067: 'rc_p067.png', rc_p068: 'rc_p068.png',
  rc_p069: 'rc_p069.png', rc_p070: 'rc_p070.png', rc_p071: 'rc_p071.png', rc_p072: 'rc_p072.png',
  rc_p073: 'rc_p073.jpg', rc_p074: 'rc_p074.png', rc_p075: 'rc_p075.png', rc_p076: 'rc_p076.png',
  rc_p077: 'rc_p077.png', rc_p078: 'rc_p078.png', rc_p079: 'rc_p079.png', rc_p080: 'rc_p080.png',
  rc_p081: 'rc_p081.png', rc_p082: 'rc_p082.png', rc_p083: 'rc_p083.png', rc_p084: 'rc_p084.png',
  rc_p085: 'rc_p085.png', rc_p086: 'rc_p086.png', rc_p087: 'rc_p087.png', rc_p088: 'rc_p088.png',
  rc_p089: 'rc_p089.png', rc_p090: 'rc_p090.png', rc_p091: 'rc_p091.png', rc_p092: 'rc_p092.png',
  rc_p093: 'rc_p093.png', rc_p094: 'rc_p094.png', rc_p095: 'rc_p095.png', rc_p096: 'rc_p096.png',
  rc_p097: 'rc_p097.png', rc_p098: 'rc_p098.png', rc_p099: 'rc_p099.png', rc_p100: 'rc_p100.png',
  rc_p101: 'rc_p101.png', rc_p102: 'rc_p102.png', rc_p103: 'rc_p103.png', rc_p104: 'rc_p104.jpg',
  rc_p105: 'rc_p105.jpg', rc_p106: 'rc_p106.png', rc_p107: 'rc_p107.png', rc_p108: 'rc_p108.png',
  rc_p109: 'rc_p109.png', rc_p110: 'rc_p110.png', rc_p111: 'rc_p111.jpg', rc_p112: 'rc_p112.png',
  rc_p113: 'rc_p113.jpg', rc_p114: 'rc_p114.png', rc_p115: 'rc_p115.jpg', rc_p116: 'rc_p116.png',
  rc_p117: 'rc_p117.jpg', rc_p118: 'rc_p118.jpg', rc_p119: 'rc_p119.jpg', rc_p120: 'rc_p120.jpg',
};

/**
 * Resolves the real image URL if valid, or returns null to use vector fallback
 * @param {string} [productId='']
 * @param {string} [rawImageUrl='']
 * @returns {string|null}
 */
export function getProductImageUrl(productId = '', rawImageUrl = '') {
  const cleanId = String(productId || '').trim().toLowerCase();
  
  if (cleanId.startsWith('rc_p')) {
    const fn = RC_IMAGE_FILES[cleanId] || `${cleanId}.jpg`;
    return `/images/products/${fn}`;
  }

  const raw = String(rawImageUrl || '').trim();
  if (raw && !raw.includes('example.test') && !raw.endsWith('.svg') && !raw.includes('PROD_')) {
    return raw;
  }

  return null;
}

/**
 * Detects device category from categoryId, categoryName, or productName
 * @param {string} [nameOrCategory='']
 * @returns {'laptop' | 'phone' | 'audio' | 'tablet' | 'watch' | 'accessory' | 'fashion' | 'general'}
 */
export function detectDeviceCategory(nameOrCategory = '') {
  const s = String(nameOrCategory).toLowerCase();

  // Seed Catalog IDs
  if (s.includes('cat_001') || s.includes('laptop') || s.includes('macbook') || s.includes('thinkpad') || s.includes('dell') || s.includes('asus') || s.includes('máy tính xách tay')) {
    return 'laptop';
  }
  if (s.includes('cat_002') || s.includes('phone') || s.includes('smartphone') || s.includes('iphone') || s.includes('galaxy') || s.includes('xiaomi') || s.includes('điện thoại')) {
    return 'phone';
  }
  if (s.includes('cat_003') || s.includes('audio') || s.includes('headphone') || s.includes('earphone') || s.includes('airpods') || s.includes('tai nghe') || s.includes('loa') || s.includes('sound')) {
    return 'audio';
  }
  if (s.includes('cat_004') || s.includes('tablet') || s.includes('ipad') || s.includes('máy tính bảng') || s.includes('tab')) {
    return 'tablet';
  }
  if (s.includes('cat_005') || s.includes('watch') || s.includes('đồng hồ') || s.includes('band')) {
    return 'watch';
  }
  if (s.includes('cat_006') || s.includes('accessory') || s.includes('phụ kiện') || s.includes('charger') || s.includes('sạc') || s.includes('cáp') || s.includes('mouse') || s.includes('chuột') || s.includes('bàn phím') || s.includes('keyboard')) {
    return 'accessory';
  }

  // Reference Catalog Fashion categories
  if (s.includes('rc_cat') || s.includes('áo') || s.includes('quần') || s.includes('giày') || s.includes('thời trang') || s.includes('polo') || s.includes('jeans')) {
    return 'fashion';
  }

  return 'general';
}

/**
 * Returns clean category icon SVG paths (for small 44x44px badges in History / Admin)
 * @param {string} [nameOrCategory='']
 * @returns {string} SVG inner markup
 */
export function getCategoryIconPaths(nameOrCategory = '') {
  const cat = detectDeviceCategory(nameOrCategory);

  switch (cat) {
    case 'laptop':
      return `<path d="M4 6h16a1 1 0 0 1 1 1v10H3V7a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.75" fill="none"/>
              <path d="M1 18h22a1 1 0 0 1 1 1v1H0v-1a1 1 0 0 1 1-1z" fill="currentColor"/>
              <path d="M10 18h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`;
    case 'phone':
      return `<rect x="6" y="3" width="12" height="18" rx="2.5" stroke="currentColor" stroke-width="1.75" fill="none"/>
              <circle cx="12" cy="18" r="0.75" fill="currentColor"/>
              <path d="M10 5.5h4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>`;
    case 'audio':
      return `<path d="M4 12v-2a8 8 0 0 1 16 0v2" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round"/>
              <rect x="2" y="12" width="4" height="7" rx="1.5" fill="currentColor"/>
              <rect x="18" y="12" width="4" height="7" rx="1.5" fill="currentColor"/>`;
    case 'tablet':
      return `<rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.75" fill="none"/>
              <circle cx="12" cy="18.5" r="0.75" fill="currentColor"/>`;
    case 'watch':
      return `<rect x="6" y="6" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.75" fill="none"/>
              <path d="M9 6V2h6v4M9 18v4h6v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="12" cy="12" r="1.5" fill="currentColor"/>`;
    case 'accessory':
      return `<rect x="6" y="8" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.75" fill="none"/>
              <path d="M9 8V4M15 8V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="12" cy="13.5" r="1.5" fill="currentColor"/>`;
    case 'fashion':
      return `<path d="M7 4l-4 4 3 2v10h12V10l3-2-4-4-5 2-5-2z" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linejoin="round"/>`;
    default:
      return `<rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.75" fill="none"/>
              <path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
  }
}

/**
 * Generates an elegant, high-res device illustration on clean bright background
 * TUYỆT ĐỐI KHÔNG CHÈN CHỮ LẶP LẠI VÀO ẢNH!
 * @param {string} [categoryOrName='']
 * @param {number} [width=400]
 * @param {number} [height=300]
 * @returns {string} Data URI
 */
export function getProductPlaceholderSvg(categoryOrName = '', width = 400, height = 300) {
  const cat = detectDeviceCategory(categoryOrName);

  let deviceDrawing = '';

  switch (cat) {
    case 'laptop':
      deviceDrawing = `
        <!-- Laptop Screen Body -->
        <rect x="80" y="55" width="240" height="145" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="88" y="63" width="224" height="129" rx="6" fill="#f8fafc"/>
        <!-- Screen Content Mockup Graphic -->
        <rect x="100" y="75" width="90" height="12" rx="3" fill="#3b82f6" opacity="0.8"/>
        <rect x="100" y="93" width="140" height="8" rx="2" fill="#e2e8f0"/>
        <rect x="100" y="105" width="110" height="8" rx="2" fill="#e2e8f0"/>
        <circle cx="270" cy="115" r="24" fill="#eff6ff" stroke="#bfdbfe" stroke-width="2"/>
        <path d="M260 115 l7 7 l14 -14" stroke="#2563eb" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <!-- Laptop Base / Keyboard Deck -->
        <path d="M50 205 L350 205 L330 225 L70 225 Z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="165" y="210" width="70" height="8" rx="2" fill="#cbd5e1"/>
      `;
      break;

    case 'phone':
      deviceDrawing = `
        <!-- Smartphone Body -->
        <rect x="135" y="45" width="130" height="210" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
        <rect x="142" y="52" width="116" height="196" rx="18" fill="#f8fafc"/>
        <!-- Camera Notch / Dynamic Island -->
        <rect x="180" y="58" width="40" height="10" rx="5" fill="#0f172a"/>
        <circle cx="192" cy="63" r="2.5" fill="#38bdf8"/>
        <!-- Screen Graphical Elements -->
        <rect x="156" y="80" width="88" height="38" rx="8" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5"/>
        <circle cx="174" cy="99" r="8" fill="#3b82f6" opacity="0.8"/>
        <rect x="190" y="92" width="42" height="6" rx="2" fill="#3b82f6"/>
        <rect x="190" y="101" width="30" height="5" rx="2" fill="#93c5fd"/>
        <!-- App Grid Icons -->
        <rect x="156" y="130" width="24" height="24" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
        <rect x="188" y="130" width="24" height="24" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
        <rect x="220" y="130" width="24" height="24" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
        <!-- Home Bar -->
        <rect x="175" y="238" width="50" height="4" rx="2" fill="#94a3b8"/>
      `;
      break;

    case 'audio':
      deviceDrawing = `
        <!-- Headband Arc -->
        <path d="M120 160 A 80 80 0 0 1 280 160" stroke="#cbd5e1" stroke-width="10" fill="none" stroke-linecap="round"/>
        <path d="M130 145 A 70 70 0 0 1 270 145" stroke="#3b82f6" stroke-width="4" fill="none" opacity="0.6"/>
        <!-- Left Ear Cushion -->
        <rect x="100" y="145" width="36" height="70" rx="16" fill="#ffffff" stroke="#2563eb" stroke-width="3"/>
        <rect x="106" y="153" width="24" height="54" rx="10" fill="#eff6ff"/>
        <!-- Right Ear Cushion -->
        <rect x="264" y="145" width="36" height="70" rx="16" fill="#ffffff" stroke="#2563eb" stroke-width="3"/>
        <rect x="270" y="153" width="24" height="54" rx="10" fill="#eff6ff"/>
        <!-- Sound Wave Accent -->
        <path d="M190 175 Q 200 165 210 175 T 220 175" stroke="#3b82f6" stroke-width="3" fill="none" stroke-linecap="round"/>
      `;
      break;

    case 'tablet':
      deviceDrawing = `
        <!-- Tablet Body -->
        <rect x="100" y="50" width="200" height="200" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
        <rect x="110" y="60" width="180" height="180" rx="10" fill="#f8fafc"/>
        <circle cx="200" cy="55" r="2.5" fill="#94a3b8"/>
        <!-- Tablet Content -->
        <rect x="125" y="75" width="150" height="85" rx="8" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5"/>
        <circle cx="160" cy="117" r="16" fill="#3b82f6" opacity="0.7"/>
        <rect x="125" y="172" width="95" height="10" rx="3" fill="#cbd5e1"/>
        <rect x="125" y="188" width="130" height="8" rx="2" fill="#e2e8f0"/>
        <!-- Stylus Pen -->
        <path d="M305 70 L320 55 L328 63 L313 78 Z" fill="#ffffff" stroke="#3b82f6" stroke-width="2"/>
        <path d="M305 70 L301 75 L307 72 Z" fill="#0f172a"/>
      `;
      break;

    case 'watch':
      deviceDrawing = `
        <!-- Watch Straps -->
        <rect x="175" y="30" width="50" height="60" rx="6" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="175" y="210" width="50" height="60" rx="6" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
        <!-- Watch Case -->
        <rect x="155" y="80" width="90" height="140" rx="28" fill="#ffffff" stroke="#2563eb" stroke-width="3"/>
        <rect x="162" y="87" width="76" height="126" rx="22" fill="#0f172a"/>
        <!-- Watch Digital Dial -->
        <text x="200" y="145" text-anchor="middle" fill="#38bdf8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="700">10:45</text>
        <circle cx="200" cy="175" r="14" fill="none" stroke="#22c55e" stroke-width="3" stroke-dasharray="60 30"/>
        <path d="M195 175 l3 3 l7 -7" stroke="#22c55e" stroke-width="2" fill="none"/>
        <!-- Crown Button -->
        <rect x="245" y="115" width="6" height="20" rx="2" fill="#94a3b8"/>
      `;
      break;

    case 'accessory':
      deviceDrawing = `
        <!-- Fast Charger Plug -->
        <rect x="110" y="110" width="80" height="85" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="135" y="75" width="8" height="35" rx="3" fill="#94a3b8"/>
        <rect x="157" y="75" width="8" height="35" rx="3" fill="#94a3b8"/>
        <rect x="130" y="170" width="40" height="8" rx="3" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
        <!-- Wireless Mouse -->
        <ellipse cx="270" cy="155" rx="38" ry="55" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
        <path d="M270 100 v30" stroke="#3b82f6" stroke-width="2"/>
        <rect x="266" y="115" width="8" height="14" rx="3" fill="#2563eb"/>
      `;
      break;

    case 'fashion':
      deviceDrawing = `
        <!-- Minimalist Apparel Vector -->
        <path d="M130 90 L170 60 L230 60 L270 90 L250 120 L230 110 L230 220 L170 220 L170 110 L150 120 Z" fill="#ffffff" stroke="#3b82f6" stroke-width="3" stroke-linejoin="round"/>
        <path d="M185 60 Q 200 80 215 60" stroke="#3b82f6" stroke-width="2.5" fill="none"/>
        <circle cx="200" cy="115" r="3" fill="#2563eb"/>
        <circle cx="200" cy="135" r="3" fill="#2563eb"/>
        <circle cx="200" cy="155" r="3" fill="#2563eb"/>
      `;
      break;

    default:
      deviceDrawing = `
        <!-- General Tech Device Iconography -->
        <rect x="110" y="70" width="180" height="160" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
        <rect x="120" y="80" width="160" height="140" rx="10" fill="#f8fafc"/>
        <circle cx="200" cy="150" r="34" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
        <path d="M185 150 h30 M200 135 v30" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
      `;
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 400 300">
  <defs>
    <linearGradient id="bgLightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#f1f5f9"/>
    </linearGradient>
    <linearGradient id="circleAura" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#e0e7ff"/>
    </linearGradient>
  </defs>
  <!-- Background Container -->
  <rect width="100%" height="100%" fill="url(#bgLightGrad)"/>
  
  <!-- Subtle Backing Glow Circle -->
  <circle cx="200" cy="150" r="105" fill="url(#circleAura)" opacity="0.8"/>
  
  <!-- Device Vector Art (Zero text inside) -->
  <g transform="translate(0, 0)">
    ${deviceDrawing}
  </g>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
