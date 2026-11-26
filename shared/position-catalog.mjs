export const ALIYA_ADDON_PRICE_TJS = 30;
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

export const AUTHORITY_LOGIN_POSITIONS = Object.freeze(['office-head', 'raesat-head']);

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
  { id: 'school-upper-class-method-group', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Иттиҳодияи методии роҳбарони синфҳои боло', titleRu: 'МО классных руководителей старших классов', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 16 },
  { id: 'school-lower-class-method-group', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Иттиҳодияи методии роҳбарони синфҳои поён', titleRu: 'МО классных руководителей младших классов', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 17 },
  { id: 'school-five-method-groups', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Иттиҳодияи методӣ', titleRu: 'Методическое объединение', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 18 },
  { id: 'school-subject-room-head', group: 'school', compatGroup: 'C', accessRole: 'staff', titleTg: 'Мудири кабинети фаннӣ', titleRu: 'Заведующий предметным кабинетом', defaultBasePrice: 15, defaultExtraPrice: 15, sortOrder: 19 },
  { id: 'school-teacher', group: 'school', compatGroup: 'C', accessRole: 'teacher', titleTg: 'Омӯзгор', titleRu: 'Учитель', defaultBasePrice: 10, defaultExtraPrice: 10, sortOrder: 20 },

  // Education authority leadership (admin-issued logins only)
  { id: 'office-head', group: 'office', accessRole: 'maorif', titleTg: 'Мудири маориф', titleRu: 'Заведующий маорифом', defaultBasePrice: 40, defaultExtraPrice: 40, sortOrder: 21 },
  { id: 'office-accounting', group: 'office', accessRole: 'maorif', titleTg: 'Муҳосиботи маориф', titleRu: 'Бухгалтерия маорифа', defaultBasePrice: 30, defaultExtraPrice: 30, sortOrder: 22, hiddenFromLogin: true },
  { id: 'raesat-head', group: 'raesat', accessRole: 'authority_viewer', titleTg: 'Сардори раёсат', titleRu: 'Начальник управления', defaultBasePrice: 50, defaultExtraPrice: 50, sortOrder: 23 },

  // 20 Maorif advisers (hidden from login/registration; accessible via super-admin / existing cabinet registry)
  { id: 'advisers-school-leadership', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Роҳбарони мактабҳо', titleRu: 'Методист · Руководители школ', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 30, hiddenFromLogin: true },
  { id: 'advisers-academic-work', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Кори таълимӣ', titleRu: 'Методист · Учебная работа', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 31, hiddenFromLogin: true },
  { id: 'advisers-upbringing', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Кори тарбиявӣ', titleRu: 'Методист · Воспитательная работа', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 32, hiddenFromLogin: true },
  { id: 'advisers-primary-administration', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Зинаи ибтидоӣ', titleRu: 'Методист · Начальная ступень', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 33, hiddenFromLogin: true },
  { id: 'advisers-military-preparation', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Омодагии ҳарбӣ', titleRu: 'Методист · Военная подготовка', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 34, hiddenFromLogin: true },
  { id: 'advisers-sozmon', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Созмон', titleRu: 'Методист · Созмон', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 35, hiddenFromLogin: true },
  { id: 'advisers-facilities', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Хоҷагӣ ва амвол', titleRu: 'Методист · Хозяйственная работа', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 36, hiddenFromLogin: true },
  { id: 'advisers-libraries', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Китобхонаҳо', titleRu: 'Методист · Школьные библиотеки', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 37, hiddenFromLogin: true },
  { id: 'advisers-school-meals', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Ғизои мактабӣ', titleRu: 'Методист · Школьное питание', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 38, hiddenFromLogin: true },
  { id: 'advisers-education-quality', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Сифати таҳсилот', titleRu: 'Методист · Качество образования', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 39, hiddenFromLogin: true },
  { id: 'advisers-psychological-services', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Хадамоти равоншиносӣ', titleRu: 'Методист · Психологическая служба', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 40, hiddenFromLogin: true },
  { id: 'advisers-records-management', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Коргузорӣ', titleRu: 'Методист · Делопроизводство', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 41, hiddenFromLogin: true },
  { id: 'advisers-school-accounting', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Муҳосиботи мактабҳо', titleRu: 'Методист · Бухгалтерии школ', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 42, hiddenFromLogin: true },
  { id: 'advisers-class-leadership', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Роҳбарии синф', titleRu: 'Методист · Классное руководство', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 43, hiddenFromLogin: true },
  { id: 'advisers-girls-councils', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Шӯроҳои духтарон', titleRu: 'Методист · Советы девушек', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 44, hiddenFromLogin: true },
  { id: 'advisers-upper-class-method-work', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Методикаи синфҳои боло', titleRu: 'Методист · Старшие классы', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 45, hiddenFromLogin: true },
  { id: 'advisers-lower-class-method-work', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Методикаи синфҳои поён', titleRu: 'Методист · Младшие классы', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 46, hiddenFromLogin: true },
  { id: 'advisers-method-groups', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Иттиҳодияҳои методӣ', titleRu: 'Методист · Методобъединения', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 47, hiddenFromLogin: true },
  { id: 'advisers-subject-rooms', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Кабинетҳои фаннӣ', titleRu: 'Методист · Предметные кабинеты', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 48, hiddenFromLogin: true },
  { id: 'advisers-teaching-support', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Дастгирии омӯзгорон', titleRu: 'Методист · Сопровождение учителей', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 49, hiddenFromLogin: true },

  // 11 Subject advisers (hidden from login/registration)
  { id: 'subjects-tajik-language-literature', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Забон ва адабиёти тоҷик', titleRu: 'Предметник · Таджикский язык', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 50, hiddenFromLogin: true },
  { id: 'subjects-russian-language', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Забони русӣ', titleRu: 'Предметник · Русский язык', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 51, hiddenFromLogin: true },
  { id: 'subjects-english-language', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Забони англисӣ', titleRu: 'Предметник · Английский язык', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 52, hiddenFromLogin: true },
  { id: 'subjects-informatics', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Информатика', titleRu: 'Предметник · Информатика', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 53, hiddenFromLogin: true },
  { id: 'subjects-mathematics', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Математика', titleRu: 'Предметник · Математика', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 54, hiddenFromLogin: true },
  { id: 'subjects-physics', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Физика', titleRu: 'Предметник · Физика', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 55, hiddenFromLogin: true },
  { id: 'subjects-chemistry', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Химия', titleRu: 'Предметник · Химия', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 56, hiddenFromLogin: true },
  { id: 'subjects-biology', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Биология', titleRu: 'Предметник · Биология', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 57, hiddenFromLogin: true },
  { id: 'subjects-history', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Таърих', titleRu: 'Предметник · История', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 58, hiddenFromLogin: true },
  { id: 'subjects-geography', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · География', titleRu: 'Предметник · География', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 59, hiddenFromLogin: true },
  { id: 'subjects-primary-teaching', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Таълими ибтидоӣ', titleRu: 'Предметник · Начальное обучение', defaultBasePrice: 20, defaultExtraPrice: 20, sortOrder: 60, hiddenFromLogin: true },
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
    if (tier === 'raesat') return item.group === 'raesat' || item.group === 'office' || item.group === 'advisers' || item.group === 'subjects';
    return item.group === 'office' || item.group === 'advisers' || item.group === 'subjects';
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
    const defaultMaxDevices = Number(t?.default_max_devices ?? t?.defaultMaxDevices ?? 1);
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
      return meta.group === 'office' || meta.group === 'advisers' || meta.group === 'subjects';
    case 'authority_viewer':
      return meta.group === 'raesat' || meta.group === 'office' || meta.group === 'advisers' || meta.group === 'subjects';
    default:
      return false;
  }
}

export function computePositionTariffTotal(arg1 = {}, arg2 = [], arg3 = []) {
  const opts = typeof arg1 === 'string'
    ? { primaryPosition: arg1, extraPositions: arg2, tariffs: arg3 }
    : (arg1 || {});
  const { primaryPosition = null, extraPositions = [], tariffs = [], includeAliya = false } = opts;
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
  const totalTjs = Math.round((basePrice + extrasPrice + aliyaPrice) * 100) / 100;
  return {
    basePrice,
    extrasPrice,
    aliyaPrice,
    baseTjs: basePrice,
    extraTjs: extrasPrice,
    totalTjs,
    includeAliya: Boolean(includeAliya),
    durationDays: primaryPosition ? getDays(primaryPosition) : 30,
    extraPositions: cleanExtras,
  };
}
