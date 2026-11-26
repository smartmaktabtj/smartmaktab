export const POSITION_CATALOG = Object.freeze([
  // 20 school positions
  { id: 'school-director', group: 'school', accessRole: 'school_admin', titleTg: 'Директор', titleRu: 'Директор школы', defaultBasePrice: 30, defaultExtraPrice: 15, sortOrder: 1 },
  { id: 'school-academic-deputy', group: 'school', accessRole: 'deputy', titleTg: 'Муовини таълимӣ', titleRu: 'Зам. по учебной работе', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 2 },
  { id: 'school-upbringing-deputy', group: 'school', accessRole: 'deputy', titleTg: 'Муовини тарбиягӣ', titleRu: 'Зам. по воспитательной работе', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 3 },
  { id: 'school-primary-deputy', group: 'school', accessRole: 'deputy', titleTg: 'Муовини ибтидоӣ', titleRu: 'Зам. по начальным классам', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 4 },
  { id: 'school-military-preparation-deputy', group: 'school', accessRole: 'deputy', titleTg: 'Муовини ҳарбӣ', titleRu: 'Зам. по военной подготовке', defaultBasePrice: 15, defaultExtraPrice: 8, sortOrder: 5 },
  { id: 'school-sozmon', group: 'school', accessRole: 'staff', titleTg: 'Созмон', titleRu: 'Созмон (ученическая организация)', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 6 },
  { id: 'school-facilities-head', group: 'school', accessRole: 'staff', titleTg: 'Мудири хоҷагӣ', titleRu: 'Завхоз', defaultBasePrice: 15, defaultExtraPrice: 8, sortOrder: 7 },
  { id: 'school-library-head', group: 'school', accessRole: 'staff', titleTg: 'Мудири китобхона', titleRu: 'Библиотекарь', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 8 },
  { id: 'school-canteen-head', group: 'school', accessRole: 'staff', titleTg: 'Мудири ошхона', titleRu: 'Заведующий столовой', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 9 },
  { id: 'school-education-quality', group: 'school', accessRole: 'staff', titleTg: 'Сифати таҳсилот', titleRu: 'Контроль качества образования', defaultBasePrice: 18, defaultExtraPrice: 9, sortOrder: 10 },
  { id: 'school-psychologist', group: 'school', accessRole: 'staff', titleTg: 'Равоншинос', titleRu: 'Школьный психолог', defaultBasePrice: 12, defaultExtraPrice: 6, sortOrder: 11 },
  { id: 'school-records-clerk', group: 'school', accessRole: 'staff', titleTg: 'Коргузор', titleRu: 'Делопроизводитель', defaultBasePrice: 15, defaultExtraPrice: 8, sortOrder: 12 },
  { id: 'school-accountant', group: 'school', accessRole: 'staff', titleTg: 'Бухгалтер', titleRu: 'Бухгалтер школы', defaultBasePrice: 25, defaultExtraPrice: 12, sortOrder: 13 },
  { id: 'school-class-teacher', group: 'school', accessRole: 'staff', titleTg: 'Роҳбари синф', titleRu: 'Классный руководитель', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 14 },
  { id: 'school-girls-council-chair', group: 'school', accessRole: 'staff', titleTg: 'Раиси Шӯрои духтарон', titleRu: 'Председатель совета девушек', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 15 },
  { id: 'school-upper-class-method-group', group: 'school', accessRole: 'staff', titleTg: 'Иттиҳодияи методии синфҳои боло', titleRu: 'Методобъединение старших классов', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 16 },
  { id: 'school-lower-class-method-group', group: 'school', accessRole: 'staff', titleTg: 'Иттиҳодияи методии синфҳои поён', titleRu: 'Методобъединение младших классов', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 17 },
  { id: 'school-five-method-groups', group: 'school', accessRole: 'staff', titleTg: 'Панҷ иттиҳодияи методӣ', titleRu: 'Пять методических объединений', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 18 },
  { id: 'school-subject-room-head', group: 'school', accessRole: 'staff', titleTg: 'Мудири кабинети фаннӣ', titleRu: 'Заведующий предметным кабинетом', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 19 },
  { id: 'school-teacher', group: 'school', accessRole: 'teacher', titleTg: 'Муаллим / Омӯзгор', titleRu: 'Учитель', defaultBasePrice: 10, defaultExtraPrice: 5, sortOrder: 20 },

  // Education authority (Maorif & Raesat) positions
  { id: 'office-head', group: 'office', accessRole: 'maorif', titleTg: 'Роҳбари маориф', titleRu: 'Руководитель маорифа', defaultBasePrice: 40, defaultExtraPrice: 15, sortOrder: 21 },
  { id: 'office-accounting', group: 'office', accessRole: 'maorif', titleTg: 'Муҳосиботи маориф', titleRu: 'Бухгалтерия маорифа', defaultBasePrice: 30, defaultExtraPrice: 12, sortOrder: 22 },
  { id: 'raesat-head', group: 'raesat', accessRole: 'authority_viewer', titleTg: 'Роҳбари раёсат', titleRu: 'Руководитель раёсата', defaultBasePrice: 50, defaultExtraPrice: 20, sortOrder: 23 },

  // 20 Maorif advisers
  { id: 'advisers-school-leadership', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Роҳбарони мактабҳо', titleRu: 'Методист · Руководители школ', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 30 },
  { id: 'advisers-academic-work', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Кори таълимӣ', titleRu: 'Методист · Учебная работа', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 31 },
  { id: 'advisers-upbringing', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Кори тарбиявӣ', titleRu: 'Методист · Воспитательная работа', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 32 },
  { id: 'advisers-primary-administration', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Зинаи ибтидоӣ', titleRu: 'Методист · Начальная ступень', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 33 },
  { id: 'advisers-military-preparation', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Омодагии ҳарбӣ', titleRu: 'Методист · Военная подготовка', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 34 },
  { id: 'advisers-sozmon', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Созмон', titleRu: 'Методист · Созмон', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 35 },
  { id: 'advisers-facilities', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Хоҷагӣ ва амвол', titleRu: 'Методист · Хозяйственная работа', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 36 },
  { id: 'advisers-libraries', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Китобхонаҳо', titleRu: 'Методист · Школьные библиотеки', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 37 },
  { id: 'advisers-school-meals', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Ғизои мактабӣ', titleRu: 'Методист · Школьное питание', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 38 },
  { id: 'advisers-education-quality', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Сифати таҳсилот', titleRu: 'Методист · Качество образования', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 39 },
  { id: 'advisers-psychological-services', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Хадамоти равоншиносӣ', titleRu: 'Методист · Психологическая служба', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 40 },
  { id: 'advisers-records-management', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Коргузорӣ', titleRu: 'Методист · Делопроизводство', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 41 },
  { id: 'advisers-school-accounting', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Муҳосиботи мактабҳо', titleRu: 'Методист · Бухгалтерии школ', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 42 },
  { id: 'advisers-class-leadership', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Роҳбарии синф', titleRu: 'Методист · Классное руководство', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 43 },
  { id: 'advisers-girls-councils', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Шӯроҳои духтарон', titleRu: 'Методист · Советы девушек', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 44 },
  { id: 'advisers-upper-class-method-work', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Методикаи синфҳои боло', titleRu: 'Методист · Старшие классы', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 45 },
  { id: 'advisers-lower-class-method-work', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Методикаи синфҳои поён', titleRu: 'Методист · Младшие классы', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 46 },
  { id: 'advisers-method-groups', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Иттиҳодияҳои методӣ', titleRu: 'Методист · Методобъединения', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 47 },
  { id: 'advisers-subject-rooms', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Кабинетҳои фаннӣ', titleRu: 'Методист · Предметные кабинеты', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 48 },
  { id: 'advisers-teaching-support', group: 'advisers', accessRole: 'maorif', titleTg: 'Мушовир · Дастгирии омӯзгорон', titleRu: 'Методист · Сопровождение учителей', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 49 },

  // 11 Subject advisers
  { id: 'subjects-tajik-language-literature', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Забон ва адабиёти тоҷик', titleRu: 'Предметник · Таджикский язык', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 50 },
  { id: 'subjects-russian-language', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Забони русӣ', titleRu: 'Предметник · Русский язык', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 51 },
  { id: 'subjects-english-language', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Забони англисӣ', titleRu: 'Предметник · Английский язык', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 52 },
  { id: 'subjects-informatics', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Информатика', titleRu: 'Предметник · Информатика', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 53 },
  { id: 'subjects-mathematics', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Математика', titleRu: 'Предметник · Математика', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 54 },
  { id: 'subjects-physics', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Физика', titleRu: 'Предметник · Физика', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 55 },
  { id: 'subjects-chemistry', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Химия', titleRu: 'Предметник · Химия', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 56 },
  { id: 'subjects-biology', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Биология', titleRu: 'Предметник · Биология', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 57 },
  { id: 'subjects-history', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Таърих', titleRu: 'Предметник · История', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 58 },
  { id: 'subjects-geography', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · География', titleRu: 'Предметник · География', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 59 },
  { id: 'subjects-primary-teaching', group: 'subjects', accessRole: 'maorif', titleTg: 'Мушовир · Таълими ибтидоӣ', titleRu: 'Предметник · Начальное обучение', defaultBasePrice: 20, defaultExtraPrice: 10, sortOrder: 60 },
]);

const BY_ID = new Map(POSITION_CATALOG.map(item => [item.id, item]));

export function getPositionMeta(positionCode) {
  return BY_ID.get(positionCode) || null;
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

export function getPositionsForOrg(org, tariffs = null) {
  const isAuthority = org?.kind === 'education_authority';
  const tier = org?.authority_tier || '';
  const items = POSITION_CATALOG.filter(item => {
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
    const canReceiveLogin = t ? t.can_receive_login !== false && t.canReceiveLogin !== false : true;
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
  const { primaryPosition = null, extraPositions = [], tariffs = [] } = opts;
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
    return BY_ID.get(code)?.defaultExtraPrice ?? 5;
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
  const totalTjs = Math.round((basePrice + extrasPrice) * 100) / 100;
  return {
    basePrice,
    extrasPrice,
    baseTjs: basePrice,
    extraTjs: extrasPrice,
    totalTjs,
    durationDays: primaryPosition ? getDays(primaryPosition) : 30,
    extraPositions: cleanExtras,
  };
}
