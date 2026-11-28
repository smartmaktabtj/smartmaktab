export const ALIYA_ADDON_PRICE_TJS = 30;
export const STORAGE_PACK_PRICE_TJS = 10;
export const STORAGE_PACK_FOLDERS = 20;
export const STORAGE_PACK_DRAFTS = 50;
export const BASE_DOC_FOLDERS_LIMIT = 20;
export const BASE_DOC_DRAFTS_LIMIT = 50;
export const LOGIN_EMAIL_DOMAIN = 'login.smartmaktab.tj';

export const POSITION_COMPAT_GROUPS = Object.freeze({
  A: Object.freeze([
    'school-director',
    'school-academic-deputy',
    'school-upbringing-deputy',
    'school-primary-deputy',
    'school-military-preparation-deputy',
    'school-sozmon',
    'school-records-clerk',
  ]),
  B: Object.freeze([
    'school-facilities-head',
    'school-canteen-head',
  ]),
  C: Object.freeze([
    'school-library-head',
    'school-education-quality',
    'school-psychologist',
    'school-class-teacher',
    'school-girls-council-chair',
    'school-upper-class-method-group',
    'school-lower-class-method-group',
    'school-five-method-groups',
    'school-subject-room-head',
    'school-teacher',
  ]),
  D: Object.freeze([
    'school-accountant',
  ]),
});

export const AUTHORITY_LOGIN_POSITIONS = Object.freeze(['office-head', 'office-clerk', 'raesat-head', 'raesat-clerk']);

export const SCHOOL_ACCOUNT_VERIFIER_POSITIONS = Object.freeze([
  'school-director',
  'school-academic-deputy',
  'school-upbringing-deputy',
  'school-records-clerk',
]);

export const USER_MANAGER_POSITIONS = Object.freeze([
  'school-director',
  'school-academic-deputy',
  'school-upbringing-deputy',
  'school-records-clerk',
  'office-head',
  'office-clerk',
  'raesat-head',
  'raesat-clerk',
]);

export const SUBSCRIPTION_PERIOD_PACKAGES = Object.freeze([
  { months: 1, days: 30, discountPct: 0, labelTg: '1 моҳ (бе тахфиф)', labelRu: '1 месяц (без скидки)' },
  { months: 3, days: 90, discountPct: 3, labelTg: '3 моҳ (тахфифи 3%)', labelRu: '3 месяца (скидка 3%)' },
  { months: 6, days: 180, discountPct: 5, labelTg: '6 моҳ (тахфифи 5%)', labelRu: '6 месяцев (скидка 5%)' },
  { months: 9, days: 270, discountPct: 10, labelTg: '9 моҳ (тахфифи 10%)', labelRu: '9 месяцев (скидка 10%)' },
  { months: 12, days: 365, discountPct: 15, labelTg: '1 сол / 12 моҳ (тахфифи 15%)', labelRu: '1 год / 12 мес. (скидка 15%)' },
]);

export function canPositionVerifySchoolStaff(positionCode) {
  return SCHOOL_ACCOUNT_VERIFIER_POSITIONS.includes(String(positionCode || '').trim());
}

export function canPositionManageUsers(positionCode) {
  return USER_MANAGER_POSITIONS.includes(String(positionCode || '').trim());
}

export function computeAllowedDeviceQuota(extraPositionsCount = 0) {
  const extras = Math.max(0, Number(extraPositionsCount) || 0);
  return Math.min(40, (1 + extras) * 2);
}

export const POSITION_CATALOG = Object.freeze([
  // 20 school positions (Group A/B/C/D compatibility & exact full prices)
  { id: 'school-director', group: 'school', compatGroup: 'A', accessRole: 'school_admin', titleTg: 'Директор', titleRu: 'Директор', defaultBasePrice: 50, defaultExtraPrice: 50, sortOrder: 1 },
  { id: 'school-academic-deputy', group: 'school', compatGroup: 'A', accessRole: 'deputy', titleTg: 'Муовини таълимӣ', titleRu: 'Зам. по учебной работе', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 2 },
  { id: 'school-upbringing-deputy', group: 'school', compatGroup: 'A', accessRole: 'deputy', titleTg: 'Муовини тарбиягӣ', titleRu: 'Зам. по воспитательной работе', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 3 },
  { id: 'school-primary-deputy', group: 'school', compatGroup: 'A', accessRole: 'deputy', titleTg: 'Муовини ибтидоӣ', titleRu: 'Зам. по начальным классам', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 4 },
  { id: 'school-military-preparation-deputy', group: 'school', compatGroup: 'A', accessRole: 'deputy', titleTg: 'Муовини ҳарбӣ', titleRu: 'Зам. по военной подготовке', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 5 },
  { id: 'school-sozmon', group: 'school', compatGroup: 'A', accessRole: 'staff', titleTg: 'Созмон', titleRu: 'Созмон', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 6 },
  { id: 'school-facilities-head', group: 'school', compatGroup: 'B', accessRole: 'staff', titleTg: 'Мудири хоҷагӣ', titleRu: 'Заведующий хозяйством', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 7 },
  { id: 'school-library-head', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Мудири китобхона', titleRu: 'Заведующий библиотекой', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 8 },
  { id: 'school-canteen-head', group: 'school', compatGroup: 'B', accessRole: 'staff', titleTg: 'Мудири ошхона', titleRu: 'Заведующий столовой', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 9 },
  { id: 'school-education-quality', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Сифати таҳсилот', titleRu: 'Качество образования', defaultBasePrice: 60, defaultExtraPrice: 60, sortOrder: 10 },
  { id: 'school-psychologist', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Равоншинос', titleRu: 'Психолог', defaultBasePrice: 30, defaultExtraPrice: 30, sortOrder: 11 },
  { id: 'school-records-clerk', group: 'school', compatGroup: 'A', accessRole: 'staff', titleTg: 'Коргаргузор', titleRu: 'Делопроизводитель', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 12 },
  { id: 'school-accountant', group: 'school', compatGroup: 'D', accessRole: 'staff', titleTg: 'Бухгалтер', titleRu: 'Бухгалтер', defaultBasePrice: 50, defaultExtraPrice: 50, sortOrder: 13 },
  { id: 'school-class-teacher', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Роҳбари синф', titleRu: 'Классный руководитель', defaultBasePrice: 10, defaultExtraPrice: 10, sortOrder: 14 },
  { id: 'school-girls-council-chair', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Раиси Шӯрои духтарон', titleRu: 'Председатель Совета девушек', defaultBasePrice: 30, defaultExtraPrice: 30, sortOrder: 15 },
  { id: 'school-upper-class-method-group', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Иттиҳодияи методии роҳбарони синфҳои 5-11', titleRu: 'МО классных руководителей 5-11 классов', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 16 },
  { id: 'school-lower-class-method-group', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Иттиҳодияи методии роҳбарони синфҳои 1-4', titleRu: 'МО классных руководителей 1-4 классов', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 17 },
  { id: 'school-five-method-groups', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Иттиҳодияи методӣ', titleRu: 'Методическое объединение', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 18 },
  { id: 'school-subject-room-head', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Мудири кабинети фаннӣ', titleRu: 'Заведующий предметным кабинетом', defaultBasePrice: 15, defaultExtraPrice: 15, sortOrder: 19 },
  { id: 'school-teacher', group: 'school', compatGroup: 'C', accessRole: 'teacher', titleTg: 'Омӯзгор', titleRu: 'Учитель', defaultBasePrice: 10, defaultExtraPrice: 10, sortOrder: 20 },

  // Education authority leadership & clerks (admin-issued logins)
  { id: 'office-head', group: 'office', accessRole: 'maorif', titleTg: 'Мудири маориф', titleRu: 'Мудири маориф', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 21 },
  { id: 'office-clerk', group: 'office', accessRole: 'maorif', titleTg: 'Коргаргузори маориф', titleRu: 'Коргаргузори маориф', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 22 },
  { id: 'raesat-head', group: 'raesat', accessRole: 'authority_viewer', titleTg: 'Сардори раёсат', titleRu: 'Сардори раёсат', defaultBasePrice: 50, defaultExtraPrice: 50, sortOrder: 23 },
  { id: 'raesat-clerk', group: 'raesat', accessRole: 'authority_viewer', titleTg: 'Коргаргузори раёсат', titleRu: 'Коргаргузори раёсат', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 24 },
]);

const BY_ID = new Map(POSITION_CATALOG.map(item => [item.id, item]));
const GROUP_A_SET = new Set(POSITION_COMPAT_GROUPS.A);
const GROUP_B_SET = new Set(POSITION_COMPAT_GROUPS.B);
const GROUP_C_SET = new Set(POSITION_COMPAT_GROUPS.C);
const GROUP_D_SET = new Set(POSITION_COMPAT_GROUPS.D);

export function getPositionMeta(positionCode) {
  return BY_ID.get(positionCode) || null;
}

export function isLoginCapablePosition(positionCode) {
  const m = BY_ID.get(positionCode);
  return Boolean(m && !m.hiddenFromLogin);
}

export function canCombinePositions(primaryCode, extraCode) {
  if (!primaryCode || !extraCode || primaryCode === extraCode) return false;
  if (GROUP_D_SET.has(primaryCode)) return false;
  if (GROUP_A_SET.has(primaryCode)) {
    const target = BY_ID.get(extraCode);
    return Boolean(target && target.group === 'school' && extraCode !== 'school-director');
  }
  if (GROUP_B_SET.has(primaryCode)) return GROUP_B_SET.has(extraCode);
  if (GROUP_C_SET.has(primaryCode)) return GROUP_C_SET.has(extraCode);
  return false;
}

export function getCompatibleExtraPositions(primaryCode, availableList = null) {
  const pool = Array.isArray(availableList) && availableList.length
    ? availableList
    : POSITION_CATALOG.filter(item => item.group === 'school');
  return pool.filter(item => canCombinePositions(primaryCode, item.id || item.position_code));
}

export function normalizeLoginIdentifier(raw) {
  const text = String(raw || '').trim();
  if (!text) return { valid: false, error: 'empty', email: '', display: '' };
  if (text.includes('@')) {
    const email = text.toLowerCase();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    return { valid: ok, error: ok ? '' : 'invalid_email', email, display: email };
  }
  // Normalize phone or plain login: strip spaces, +, parens, hyphens if phone-like digits (canonicalizing +992XXXXXXXXX), else lowercase safe handle
  const digitsOnly = text.replace(/[\s+()-]/g, '');
  const tjDigits = /^992(\d{9})$/.test(digitsOnly) ? digitsOnly.slice(3) : digitsOnly;
  let handle = '';
  if (/^\d{7,15}$/.test(tjDigits)) {
    handle = tjDigits;
  } else {
    handle = text.toLowerCase().replace(/\s+/g, '');
  }
  if (!/^[a-z0-9._-]{3,60}$/.test(handle)) {
    return { valid: false, error: 'invalid_login', email: '', display: text };
  }
  return {
    valid: true,
    error: '',
    email: `${handle}@${LOGIN_EMAIL_DOMAIN}`,
    display: text.trim(),
    handle,
  };
}

export function displayLoginIdentifier(emailOrLogin) {
  const s = String(emailOrLogin || '').trim();
  if (!s) return '';
  const suffix = `@${LOGIN_EMAIL_DOMAIN}`;
  if (s.toLowerCase().endsWith(suffix)) return s.slice(0, -suffix.length);
  return s;
}

export function formatPositionTitle(positionCode, lang = 'tg', tariffs = null) {
  if (!positionCode) return '—';
  const row = Array.isArray(tariffs) ? tariffs.find(t => t.position_code === positionCode) : null;
  if (row) return lang === 'ru' ? (row.title_ru || row.title_tg) : (row.title_tg || row.title_ru);
  const meta = BY_ID.get(positionCode);
  return meta ? (lang === 'ru' ? meta.titleRu : meta.titleTg) : positionCode;
}

export function getRoleForPosition(positionCode) {
  return BY_ID.get(positionCode)?.accessRole || 'staff';
}

export function getPositionsForOrg(org, tariffs = null, { includeHidden = true } = {}) {
  const isAuthority = org?.kind === 'education_authority';
  const tier = org?.authority_tier || '';
  const items = POSITION_CATALOG.filter(item => {
    if (!includeHidden && item.hiddenFromLogin) return false;
    if (!isAuthority) return item.group === 'school';
    if (tier === 'raesat') return item.group === 'raesat' || item.group === 'office';
    return item.group === 'office';
  });
  const tMap = Array.isArray(tariffs) && tariffs.length
    ? new Map(tariffs.map(t => [t.position_code || t.id, t]))
    : new Map();
  return items.map(item => {
    const t = tMap.get(item.id);
    const titleTg = t?.title_tg || t?.titleTg || item.titleTg;
    const titleRu = t?.title_ru || t?.titleRu || item.titleRu;
    const basePrice = Number(t?.base_price_tjs ?? t?.basePrice ?? item.defaultBasePrice);
    const extraPrice = Number(t?.extra_price_tjs ?? t?.extraPrice ?? item.defaultExtraPrice);
    const durationDays = Number(t?.duration_days ?? t?.durationDays ?? 30);
    const defaultMaxDevices = Number(t?.default_max_devices ?? t?.defaultMaxDevices ?? 2);
    const canReceiveLogin = item.hiddenFromLogin
      ? false
      : (t ? t.can_receive_login !== false && t.canReceiveLogin !== false : true);
    const isActive = t ? t.is_active !== false && t.isActive !== false : true;
    return {
      ...item,
      position_code: item.id,
      group_code: t?.group_code || item.group,
      access_role: t?.access_role || item.accessRole,
      titleTg,
      titleRu,
      title_tg: titleTg,
      title_ru: titleRu,
      basePrice,
      extraPrice,
      base_price_tjs: basePrice,
      extra_price_tjs: extraPrice,
      durationDays,
      duration_days: durationDays,
      defaultMaxDevices,
      default_max_devices: defaultMaxDevices,
      canReceiveLogin,
      can_receive_login: canReceiveLogin,
      isActive,
      is_active: isActive,
    };
  });
}

export function isCabinetPermitted(membership, cabinetId) {
  if (!membership || !cabinetId) return false;
  if (membership.account_active === false) return false;
  if (membership.primary_position) {
    if (membership.primary_position === cabinetId) return true;
    return Array.isArray(membership.extra_positions) && membership.extra_positions.includes(cabinetId);
  }
  const meta = BY_ID.get(cabinetId);
  if (!meta) return false;
  switch (membership.role) {
    case 'school_admin':
    case 'director':
      return meta.group === 'school';
    case 'deputy':
      return meta.group === 'school' && cabinetId !== 'school-director';
    case 'teacher':
      return cabinetId === 'school-teacher' || cabinetId === 'school-class-teacher' || cabinetId === 'school-subject-room-head';
    case 'staff':
      return meta.group === 'school' && cabinetId !== 'school-director';
    case 'maorif':
      return meta.group === 'office';
    case 'authority_viewer':
      return meta.group === 'raesat' || meta.group === 'office';
    default:
      return false;
  }
}

export function computePositionTariffTotal(arg1 = {}, arg2 = [], arg3 = []) {
  const opts = typeof arg1 === 'string'
    ? { primaryPosition: arg1, extraPositions: arg2, tariffs: arg3 }
    : (arg1 || {});
  const { primaryPosition = null, extraPositions = [], tariffs = [], includeAliya = false, storagePackCount = 0 } = opts;
  const tMap = new Map((tariffs || []).map(t => [t.position_code || t.id, t]));
  const getBase = code => {
    const row = tMap.get(code);
    if (row && Number.isFinite(Number(row.base_price_tjs))) return Number(row.base_price_tjs);
    if (row && Number.isFinite(Number(row.basePrice))) return Number(row.basePrice);
    return BY_ID.get(code)?.defaultBasePrice ?? 10;
  };
  const getExtra = code => {
    const row = tMap.get(code);
    if (row && Number.isFinite(Number(row.extra_price_tjs))) return Number(row.extra_price_tjs);
    if (row && Number.isFinite(Number(row.extraPrice))) return Number(row.extraPrice);
    return BY_ID.get(code)?.defaultExtraPrice ?? getBase(code);
  };
  const getDays = code => {
    const row = tMap.get(code);
    if (row && Number.isFinite(Number(row.duration_days))) return Number(row.duration_days);
    if (row && Number.isFinite(Number(row.durationDays))) return Number(row.durationDays);
    return 30;
  };

  const base = primaryPosition ? getBase(primaryPosition) : 0;
  const cleanExtras = [...new Set((extraPositions || []).filter(p => p && p !== primaryPosition))];
  const extrasSum = cleanExtras.reduce((sum, code) => sum + getExtra(code), 0);
  const basePrice = Math.round(base * 100) / 100;
  const extrasPrice = Math.round(extrasSum * 100) / 100;
  const aliyaPrice = includeAliya ? ALIYA_ADDON_PRICE_TJS : 0;
  const packCount = Math.max(0, Math.min(20, Number(storagePackCount) || 0));
  const storagePackPrice = packCount * STORAGE_PACK_PRICE_TJS;
  const totalTjs = Math.round((basePrice + extrasPrice + aliyaPrice + storagePackPrice) * 100) / 100;
  return {
    basePrice,
    extrasPrice,
    aliyaPrice,
    storagePackCount: packCount,
    storagePackPrice,
    baseTjs: basePrice,
    extraTjs: extrasPrice,
    totalTjs,
    includeAliya: Boolean(includeAliya),
    durationDays: primaryPosition ? getDays(primaryPosition) : 30,
    extraPositions: cleanExtras,
  };
}

export function getSubscriptionPackage(months = 1) {
  const m = Number(months) || 1;
  return SUBSCRIPTION_PERIOD_PACKAGES.find(p => p.months === m) || SUBSCRIPTION_PERIOD_PACKAGES[0];
}

export function computeSubscriptionPackagePrice(opts = {}, monthsArg = 1) {
  if (typeof opts === 'number') {
    const monthlyTjs = Math.round(Math.max(0, opts) * 100) / 100;
    const pkg = getSubscriptionPackage(monthsArg);
    const grossTjs = Math.round(monthlyTjs * pkg.months * 100) / 100;
    const discountTjs = Math.round(grossTjs * (pkg.discountPct / 100) * 100) / 100;
    const totalTjs = Math.round((grossTjs - discountTjs) * 100) / 100;
    return {
      basePrice: monthlyTjs,
      extrasPrice: 0,
      aliyaPrice: 0,
      baseTjs: monthlyTjs,
      extraTjs: 0,
      monthlyTjs,
      months: pkg.months,
      days: pkg.days,
      discountPct: pkg.discountPct,
      grossTjs,
      discountTjs,
      savedTjs: discountTjs,
      totalTjs,
      includeAliya: false,
      durationDays: pkg.days,
      extraPositions: [],
    };
  }
  const monthly = computePositionTariffTotal(opts);
  const pkg = getSubscriptionPackage(opts.months);
  const grossTjs = Math.round(monthly.totalTjs * pkg.months * 100) / 100;
  const discountTjs = Math.round(grossTjs * (pkg.discountPct / 100) * 100) / 100;
  const totalTjs = Math.round((grossTjs - discountTjs) * 100) / 100;
  return {
    ...monthly,
    monthlyTjs: monthly.totalTjs,
    months: pkg.months,
    days: pkg.days,
    discountPct: pkg.discountPct,
    grossTjs,
    discountTjs,
    savedTjs: discountTjs,
    totalTjs,
  };
}
