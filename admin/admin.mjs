import { createCloudClient } from '../shared/cloud-client.mjs';
import { getCloudConfig } from '../shared/cloud-config.mjs';
import { evaluateLicenseState } from '../shared/license-guard.mjs';
import {
  POSITION_CATALOG,
  formatPositionTitle,
  getPositionsForOrg,
  getRoleForPosition,
} from '../shared/position-catalog.mjs';

const LANG_STORAGE_KEY = 'smartmaktab.admin.lang.v1';

const copy = {
  tg: {
    title: 'SmartMaktab Admin',
    sub: 'Идораи муассисаҳо, вазифаҳо, тарифҳо, дастрасии дастгоҳҳо ва пардохтҳо',
    lang: 'Забон',
    signOut: 'Баромадан',
    reload: 'Навсозӣ',
    loginTitle: 'Вориди маъмури низом (Супер-админ)',
    email: 'Почтаи электронӣ',
    password: 'Рамз',
    signIn: 'Ворид шудан',
    sendRecovery: 'Пайванди таъини рамз ба почта',
    recoverySent: 'Пайванди воридшавӣ / ивази рамз ба почта фиристода шуд.',
    setPasswordTitle: 'Таъин ё навсозии рамзи маъмур',
    newPassword: 'Рамзи нав (на кам аз 8 рамз)',
    projectInfo: 'Лоиҳаи Supabase',
    needSuperAdmin: 'Ин ҳисоб ҳуқуқи маъмури низом (super_admin) надорад.',
    signedIn: 'Ворид шудед ҳамчун маъмури низом.',
    statRaesat: 'Раёсатҳо (вилоят/шаҳр)',
    statMaorif: 'Шуъбаҳои маориф',
    statSchools: 'Мактабҳо / муассисаҳо',
    statAccounts: 'Ҳисобҳои фаъол',
    statPendingPay: 'Чекҳои интизор',
    tabOrgs: 'Муассисаҳо ва мактабҳо',
    tabRoles: 'Корбарон, вазифаҳо ва дастгоҳҳо',
    tabLicenses: 'Иҷозатномаҳо ва квотаҳо',
    tabPlans: 'Тарифҳои вазифаҳо ва реквизитҳо',
    tabPayments: 'Чекҳои пардохт (OCR)',
    orgsHint: 'Ин ҷо сохтори маъмуриро идора кунед: Раёсат (вилоят) → Шуъбаи маориф (шаҳр/ноҳия) → Мактаб. Барои тағйир тугмаи «Таҳрир» ва барои нест кардан «Нест кардан»-ро пахш кунед.',
    rolesHint: 'Барои пешгирии суиистифода (тақсими 1 логину парол ба 20 омӯзгор), дар ин бахш шумораи дастгоҳҳо (одатан 1) ва шумораи вазифаҳои иловагиро барои ҳар як корбар маҳдуд кунед.',
    licensesHint: 'Иҷозатнома муҳлати дастрасии муассиса, давраи имтиёзии офлайн (30 рӯз) ва шумораи умумии логинҳоро барои як мактаб муайян мекунад.',
    plansHint: 'Нархи инфиродӣ барои ҳар як вазифа (асосӣ ва иловагӣ), шумораи дастгоҳҳо ва иҷозати гирифтани логину пароли алоҳидаро ин ҷо муқаррар намоед.',
    orgName: 'Номи муассиса',
    orgNameHint: 'Масалан: МТМУ № 45 ё Шуъбаи маорифи н. Данғара',
    orgTypeLabel: 'Навъи муассиса',
    orgTypeHint: 'Сатри дигар ба таври худкор мутобиқ мешавад',
    presetSchool: 'Мактаб / Муассисаи таълимӣ',
    presetMaorif: 'Шуъбаи маорифи шаҳр / ноҳия',
    presetRaesat: 'Раёсати маориф (вилоят / ҷумҳурӣ)',
    region: 'Вилоят / Минтақа',
    regionHint: 'Аз рӯйхат интихоб кунед (масалан: Хатлон, Суғд, Душанбе)',
    district: 'Шаҳр / Ноҳия',
    districtHint: 'Барои Раёсати вилоятӣ холӣ монед',
    orgParent: 'Мақоми болоӣ (волид)',
    orgParentHint: 'Барои мактаб — шуъбаи маориф интихоб мешавад',
    schoolCode: 'Рамзи ягонаи муассиса',
    schoolCodeHint: 'Мисол: SM-089 (агар холӣ бошад, худкор сохта мешавад)',
    generateCode: 'Рамзи нав',
    cancelEdit: 'Бекор кардан (муассисаи нав)',
    editingOrgPrefix: 'Таҳрири муассиса:',
    editOrg: 'Таҳрир',
    deleteOrg: 'Нест кардан',
    openRole: 'Корбар / дастрасӣ',
    openLicense: 'Иҷозатнома',
    confirmDeleteOrg: 'Муассисаи «{name}» ({loc})-ро нест мекунед?',
    confirmForceDelete: 'Ба «{name}» корбарон, иҷозатнома, муассисаҳои тобеъ ё сабтҳо вобастаанд.\nОнҳоро низ комилан ва бебозгашт нест кунем?',
    deletedOrg: 'Муассиса нест карда шуд.',
    allKinds: 'Ҳама навъҳо',
    allRegions: 'Ҳама вилоятҳо',
    allDistricts: 'Ҳама шаҳру ноҳияҳо',
    filterRegion: 'Филтри вилоят',
    filterDistrict: 'Филтри шаҳр / ноҳия',
    filterKind: 'Навъи муассиса',
    filterSearch: 'Ҷустуҷӯ (ном ё код)',
    showingCount: 'Намоиш: {shown} аз {total}',
    save: 'Сабт кардан',
    saved: 'Маълумот бо муваффақият сабт шуд.',
    pickUser: 'Интихоби корбари мавҷуда (ихтиёрӣ)',
    newAccountOption: '— Ҳисоби нав бо email —',
    userEmail: 'Email (логини корбар)',
    fullName: 'Ному насаб',
    roleRegionFilter: 'Филтри вилоят барои муассиса',
    licRegionFilter: 'Филтри вилоят',
    targetOrg: 'Муассиса / Мактаб',
    primaryPosition: 'Вазифаи асосӣ (утоқи асосӣ)',
    accessLevel: 'Сатҳи ҳуқуқ дар пойгоҳ',
    accessLevelHint: 'Аз рӯи вазифа худкор интихоб мешавад',
    maxExtraPos: 'Макс. вазифаҳои иловагӣ',
    maxExtraHint: '0 = танҳо вазифаи асосӣ; 1..19 = бо вазифаҳои иловагӣ',
    maxDevices: 'Макс. дастгоҳ барои 1 логин',
    maxDevicesHint: '1 = танҳо дар 1 телефон/компютер кор мекунад (зидди тақсими парол)',
    tempPassword: 'Рамз (ихтиёрӣ)',
    tempPassHint: 'Агар холӣ монед (барои корбари нав) рамзи нав сохта мешавад',
    issueTempPassword: 'Сохтан / навсозии рамзи муваққатӣ',
    accountActive: 'Ҳисоб фаъол аст (иҷозати воридшавӣ)',
    extraPositionsLabel: 'Утоқҳо / вазифаҳои иловагии иҷозатдодашуда:',
    loginForbiddenWarn: 'Диққат: дар «Тарифҳои вазифаҳо» барои ин вазифа додани логини алоҳида хомӯш аст.',
    loginAllowedOk: 'Ин вазифа метавонад логину пароли алоҳида дошта бошад.',
    orgQuotaLine: 'Логинҳои ин муассиса: {used} аз {max} · Утоқҳо барои 1 логин: то {pos} · Дастгоҳ: {dev}',
    assignRole: 'Додани дастрасӣ / сабти корбар',
    editUser: 'Танзим',
    resetDevices: 'Қатъи дастгоҳҳо',
    unlinkDevice: 'Ҷудо кардан',
    resetPassword: 'Рамзи нав',
    remove: 'Хориҷ',
    devicesHeading: 'Дастгоҳҳои фаъоли корбарон (назорати зидди тақсими парол)',
    issuedTitle: 'Маълумоти дастрасӣ омода шуд:',
    copyCredentials: 'Нусхабардорӣ',
    copiedCredentials: 'Маълумоти дастрасӣ ба буфер нусха шуд.',
    hideCard: 'Пинҳон кардан',
    licenseStatus: 'Ҳолати иҷозатнома',
    statusTrial: 'Озмоишӣ',
    statusActive: 'Фаъол',
    statusGrace: 'Давраи имтиёзии офлайн',
    statusExpired: 'Муҳлат гузашта',
    statusSuspended: 'Боздошташуда',
    planCode: 'Рамзи нақша',
    expiresAt: 'Эътибор дорад то',
    graceDays: 'Рӯзҳои имтиёзии офлайн',
    maxAccounts: 'Макс. логин барои муассиса',
    maxAccountsHint: 'Чанд нафар дар ин мактаб метавонанд логини алоҳида гиранд',
    maxPosPerAcc: 'Макс. вазифа барои 1 логин',
    maxPosPerAccHint: '1 = асосӣ; 2 = асосӣ + 1 иловагӣ ва ғ.',
    defaultMaxDev: 'Дастгоҳҳо барои 1 логин (пешфарз)',
    notes: 'Эзоҳ',
    planTitleTg: 'Номи нақша (тоҷикӣ)',
    planTitleRu: 'Номи нақша (русӣ)',
    planPrice: 'Нархи асосӣ (TJS)',
    planDays: 'Муҳлат (рӯз)',
    recipientPhone: 'Рақами қабулкунанда (Амонатбонк / DCity)',
    roleTariffsTitle: 'Тарифҳои инфиродӣ барои ҳар як вазифа (54 вазифа)',
    tariffGroupFilter: 'Гурӯҳи вазифаҳо',
    tariffSearch: 'Ҷустуҷӯи вазифа',
    groupAll: 'Ҳамаи вазифаҳо (54)',
    groupSchool: 'Мактаб (20 вазифа)',
    groupMaorif: 'Шуъбаи маориф — мушовирон (20)',
    groupSubject: 'Шуъбаи маориф — фаннӣ (11)',
    groupOffice: 'Шуъбаи маориф — роҳбарият (2)',
    groupRaesat: 'Раёсати маориф (1)',
    approve30: 'Тасдиқ + 30 рӯз',
    approve365: 'Тасдиқ + 365 рӯз',
    reject: 'Рад кардан',
    noRows: 'Ягон сабт ёфт нашуд.',
    colName: 'Ном ва рамз',
    colKind: 'Навъ',
    colLocation: 'Вилоят / Ноҳия',
    colParent: 'Мақоми болоӣ',
    colUser: 'Корбар',
    colOrgPosition: 'Муассиса ва вазифа',
    colQuotas: 'Маҳдудиятҳо (дастгоҳ / вазифа)',
    colDevice: 'Дастгоҳ / Утоқ',
    colLastSeen: 'Охирин воридшавӣ',
    colStatus: 'Ҳолат',
    colReceipt: 'Чек / Тафсилоти пардохт',
    colPosition: 'Вазифа',
    colBasePrice: 'Нархи асосӣ (TJS)',
    colExtraPrice: 'Нархи иловагӣ (TJS)',
    colDays: 'Рӯз',
    colDevices: 'Дастгоҳ',
    colCanLogin: 'Логини алоҳида',
    colActive: 'Фаъол',
    colActions: 'Амалҳо',
    activeBadge: 'Фаъол',
    disabledBadge: 'Хомӯш',
    roleNames: {
      school_admin: 'Маъмури муассиса (идораи пурра)',
      director: 'Роҳбар / Директор',
      deputy: 'Муовин',
      staff: 'Корманд / Мутахассис',
      teacher: 'Омӯзгор',
      librarian: 'Китобдор',
      maorif: 'Масъули шуъбаи маориф',
      authority_viewer: 'Нозири раёсат / маориф',
      district_observer: 'Мушоҳиди ноҳиявӣ',
    },
  },
  ru: {
    title: 'SmartMaktab Admin',
    sub: 'Управление школами, должностями, тарифами, лимитами устройств и оплатами',
    lang: 'Язык',
    signOut: 'Выйти',
    reload: 'Обновить',
    loginTitle: 'Вход администратора системы (Супер-админ)',
    email: 'Электронная почта',
    password: 'Пароль',
    signIn: 'Войти',
    sendRecovery: 'Отправить ссылку для задания пароля',
    recoverySent: 'Ссылка для входа / смены пароля отправлена на почту.',
    setPasswordTitle: 'Установка / смена пароля администратора',
    newPassword: 'Новый пароль (мин. 8 символов)',
    projectInfo: 'Проект Supabase',
    needSuperAdmin: 'У этого аккаунта нет прав администратора (super_admin).',
    signedIn: 'Вы вошли как администратор системы.',
    statRaesat: 'Управлений (Раёсат)',
    statMaorif: 'Отделов (Маориф)',
    statSchools: 'Школ / учреждений',
    statAccounts: 'Выданных аккаунтов',
    statPendingPay: 'Чеков на проверке',
    tabOrgs: 'Организации и школы',
    tabRoles: 'Пользователи, должности и устройства',
    tabLicenses: 'Лицензии и квоты',
    tabPlans: 'Тарифы должностей и реквизиты',
    tabPayments: 'Чеки оплаты (OCR)',
    orgsHint: 'Здесь настраивается иерархия: Управление (область) → Отдел образования (район/город) → Школа. Вы можете добавить, отредактировать или полностью удалить любую организацию.',
    rolesHint: 'Контроль доступа и защита от передачи одного пароля 20 учителям: задайте кому выдаётся логин, какую должность и сколько доп. кабинетов он открывает, и на скольких устройствах (обычно 1) работает логин.',
    licensesHint: 'Лицензия задаёт срок доступа организации, льготный офлайн-период (30 дней) и квоту — сколько всего отдельных логинов и должностей разрешено этой школе.',
    plansHint: 'Настройте индивидуальную цену (основную и как дополнительная должность), срок действия, лимит устройств и право получения отдельного логина для каждой из 54 должностей.',
    orgName: 'Название организации',
    orgNameHint: 'Например: МТМУ № 45 или Отдел образования Дангары',
    orgTypeLabel: 'Тип организации',
    orgTypeHint: 'Нужный уровень в структуре подставится автоматически',
    presetSchool: 'Школа / Учебное учреждение',
    presetMaorif: 'Районный / городской отдел образования (Маориф)',
    presetRaesat: 'Областное / республиканское управление (Раёсат)',
    region: 'Область / Регион',
    regionHint: 'Выберите из подсказки (Хатлон, Суғд, Душанбе и т.д.)',
    district: 'Город / Район',
    districtHint: 'Для областного управления (Раёсат) не заполняется',
    orgParent: 'Вышестоящее ведомство',
    orgParentHint: 'Для школы автоматически подбирается отдел Маориф этого района',
    schoolCode: 'Уникальный код учреждения',
    schoolCodeHint: 'Например: SM-089 (можно оставить пустым — создастся автоматически)',
    generateCode: 'Сгенерировать код',
    cancelEdit: 'Сбросить (новая организация)',
    editingOrgPrefix: 'Редактирование:',
    editOrg: 'Изменить',
    deleteOrg: 'Удалить',
    openRole: 'Логины и роли',
    openLicense: 'Лицензия',
    confirmDeleteOrg: 'Удалить организацию «{name}» ({loc})?',
    confirmForceDelete: 'С организацией «{name}» связаны дочерние учреждения, аккаунты, лицензия или записи.\nУдалить её вместе со всеми привязанными данными безвозвратно?',
    deletedOrg: 'Организация удалена.',
    allKinds: 'Все типы',
    allRegions: 'Все области',
    allDistricts: 'Все города / районы',
    filterRegion: 'Фильтр области',
    filterDistrict: 'Фильтр города / района',
    filterKind: 'Тип организации',
    filterSearch: 'Поиск (название или код)',
    showingCount: 'Показано: {shown} из {total}',
    save: 'Сохранить',
    saved: 'Изменения сохранены.',
    pickUser: 'Выбрать существующий аккаунт (необяз.)',
    newAccountOption: '— Новый пользователь по Email —',
    userEmail: 'Email (логин сотрудника)',
    fullName: 'ФИО сотрудника',
    roleRegionFilter: 'Фильтр области для выбора организации',
    licRegionFilter: 'Фильтр области',
    targetOrg: 'Организация / Школа',
    primaryPosition: 'Основная должность (главный кабинет)',
    accessLevel: 'Права в системе',
    accessLevelHint: 'Выбирается автоматически под должность',
    maxExtraPos: 'Лимит доп. должностей',
    maxExtraHint: '0 = только основная должность; 1..19 = сколько доп. кабинетов разрешено',
    maxDevices: 'Макс. устройств на 1 логин',
    maxDevicesHint: '1 = работает только на 1 устройстве (защита от раздачи логина 20 сотрудникам)',
    tempPassword: 'Пароль (необязательно)',
    tempPassHint: 'Оставьте пустым для автогенерации пароля новому пользователю',
    issueTempPassword: 'Создать / сбросить временный пароль',
    accountActive: 'Аккаунт активен (вход разрешён)',
    extraPositionsLabel: 'Разрешённые дополнительные должности (кабинеты):',
    loginForbiddenWarn: 'Внимание: в таблице тарифов для этой должности запрещена выдача отдельного логина.',
    loginAllowedOk: 'Этой должности разрешено выдавать отдельный логин и пароль.',
    orgQuotaLine: 'Логины организации: {used} из {max} · Должностей на логин: до {pos} · Устройств: {dev}',
    assignRole: 'Выдать доступ / сохранить пользователя',
    editUser: 'Настроить',
    resetDevices: 'Сбросить устройства',
    unlinkDevice: 'Отвязать',
    resetPassword: 'Новый пароль',
    remove: 'Убрать доступ',
    devicesHeading: 'Активные устройства пользователей (защита от передачи пароля)',
    issuedTitle: 'Данные для входа готовы:',
    copyCredentials: 'Скопировать карточку',
    copiedCredentials: 'Карточка доступа скопирована в буфер обмена.',
    hideCard: 'Скрыть',
    licenseStatus: 'Статус лицензии',
    statusTrial: 'Пробная',
    statusActive: 'Активна',
    statusGrace: 'Льготный офлайн-период',
    statusExpired: 'Истекла',
    statusSuspended: 'Приостановлена',
    planCode: 'Код плана',
    expiresAt: 'Действует до',
    graceDays: 'Льготных офлайн-дней',
    maxAccounts: 'Макс. логинов для организации',
    maxAccountsHint: 'Сколько отдельных логинов можно выдать в эту школу',
    maxPosPerAcc: 'Макс. должностей на 1 логин',
    maxPosPerAccHint: '1 = только основная; 2 = основная + 1 доп. и т.д.',
    defaultMaxDev: 'Устройств на 1 логин (по умолчанию)',
    notes: 'Примечание',
    planTitleTg: 'Название плана (тадж.)',
    planTitleRu: 'Название плана (рус.)',
    planPrice: 'Базовая цена (TJS)',
    planDays: 'Срок (дней)',
    recipientPhone: 'Номер получателя (Амонатбонк / DCity)',
    roleTariffsTitle: 'Индивидуальные тарифы для каждой должности (54 должности)',
    tariffGroupFilter: 'Группа должностей',
    tariffSearch: 'Поиск должности',
    groupAll: 'Все должности (54)',
    groupSchool: 'Школа (20 должностей)',
    groupMaorif: 'Отдел образования — советники (20)',
    groupSubject: 'Отдел образования — предметники (11)',
    groupOffice: 'Отдел образования — аппарат (2)',
    groupRaesat: 'Управление образования — Раёсат (1)',
    approve30: 'Подтвердить + 30 дн.',
    approve365: 'Подтвердить + 365 дн.',
    reject: 'Отклонить',
    noRows: 'Записей нет.',
    colName: 'Название и код',
    colKind: 'Тип',
    colLocation: 'Область / Район',
    colParent: 'Вышестоящее',
    colUser: 'Сотрудник',
    colOrgPosition: 'Организация и должность',
    colQuotas: 'Квоты (устройства / роли)',
    colDevice: 'Устройство / Кабинет',
    colLastSeen: 'Последний вход',
    colStatus: 'Статус',
    colReceipt: 'Чек / детали оплаты',
    colPosition: 'Должность',
    colBasePrice: 'Основная цена (TJS)',
    colExtraPrice: 'Как доп. (TJS)',
    colDays: 'Дней',
    colDevices: 'Устройств',
    colCanLogin: 'Можно логин',
    colActive: 'Активен',
    colActions: 'Действия',
    activeBadge: 'Активен',
    disabledBadge: 'Отключён',
    roleNames: {
      school_admin: 'Администратор учреждения (полный доступ)',
      director: 'Директор / Руководитель',
      deputy: 'Заместитель',
      staff: 'Сотрудник / Специалист',
      teacher: 'Учитель',
      librarian: 'Библиотекарь',
      maorif: 'Сотрудник отдела Маориф',
      authority_viewer: 'Наблюдатель Управления / Маориф',
      district_observer: 'Инспектор района',
    },
  },
};

const $ = id => document.getElementById(id);
let lang = 'tg';
try {
  const savedLang = globalThis.localStorage?.getItem(LANG_STORAGE_KEY);
  if (savedLang === 'ru' || savedLang === 'tg') lang = savedLang;
} catch {}
$('admLang').value = lang;

const t = key => copy[lang][key] || key;
const client = createCloudClient({
  config: getCloudConfig(),
  storage: globalThis.localStorage,
  storageKey: 'smartmaktab.admin.session.v1',
});

let activeTab = 'orgs';
let editingOrgId = null;
let orgs = [];
let memberships = [];
let licenses = [];
let plans = [];
let roleTariffs = [...POSITION_CATALOG];
let payments = [];
let authUsers = [];
let deviceSessions = [];
let selectedExtraSet = new Set();

function normalizeDistrictInput(value) {
  const cleaned = String(value || '').trim();
  if (cleaned === 'Дангара') return 'Данғара';
  return cleaned;
}

function setStatus(msg, kind = '') {
  const el = $('admStatus');
  el.textContent = msg;
  el.className = `adm-status${kind ? ` ${kind}` : ''}`;
  el.hidden = !msg;
}

function orgTypeKey(org) {
  if (!org) return 'school';
  if (org.kind === 'school') return 'school';
  return org.authority_tier === 'raesat' ? 'raesat' : 'maorif';
}

function presetToKindTier(preset) {
  if (preset === 'raesat') return { kind: 'education_authority', authority_tier: 'raesat' };
  if (preset === 'maorif') return { kind: 'education_authority', authority_tier: 'maorif' };
  return { kind: 'school', authority_tier: null };
}

function orgTypeLabel(org) {
  const k = orgTypeKey(org);
  if (k === 'raesat') return t('presetRaesat');
  if (k === 'maorif') return t('presetMaorif');
  return t('presetSchool');
}

function licenseStatusLabel(status) {
  const map = {
    trial: t('statusTrial'),
    active: t('statusActive'),
    grace: t('statusGrace'),
    expired: t('statusExpired'),
    locked: t('statusExpired'),
    suspended: t('statusSuspended'),
    unconfigured: '—',
  };
  return map[status] || status;
}

function roleDisplayLabel(role) {
  return copy[lang]?.roleNames?.[role] || role || '—';
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

function orgById(id) {
  return orgs.find(o => o.id === id);
}

function userById(id) {
  return authUsers.find(u => u.id === id);
}

function orgShortName(id) {
  const o = orgById(id);
  if (!o) return '—';
  return o.school_code ? `${o.name} (${o.school_code})` : o.name;
}

function renderSummaryBar() {
  const bar = $('admSummaryBar');
  if (!bar) return;
  const raesatCnt = orgs.filter(o => orgTypeKey(o) === 'raesat').length;
  const maorifCnt = orgs.filter(o => orgTypeKey(o) === 'maorif').length;
  const schoolCnt = orgs.filter(o => orgTypeKey(o) === 'school').length;
  const pendingPayCnt = payments.filter(p => p.status === 'pending').length;

  const items = [
    [raesatCnt, t('statRaesat')],
    [maorifCnt, t('statMaorif')],
    [schoolCnt, t('statSchools')],
    [memberships.length, t('statAccounts')],
    [pendingPayCnt, t('statPendingPay')],
  ];
  bar.replaceChildren(...items.map(([num, label]) => {
    const card = document.createElement('div');
    card.className = 'adm-stat';
    const strong = document.createElement('strong');
    strong.textContent = String(num);
    const span = document.createElement('span');
    span.textContent = label;
    card.append(strong, span);
    return card;
  }));

  const payTabBtn = document.querySelector('.adm-tabs button[data-tab="payments"]');
  if (payTabBtn) {
    payTabBtn.textContent = pendingPayCnt > 0 ? `${t('tabPayments')} (${pendingPayCnt})` : t('tabPayments');
  }
}

function applyTranslations() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) {
    el.textContent = t(el.dataset.t);
  }
  renderRoleAccessOptions();
  renderSummaryBar();
  renderFilterSelects();
  renderUserPicker();
  renderOrgSelects();
  renderOrgParentOptions();
  renderPositionControls();
  renderEditBanner();
  renderTables();
}

function renderRoleAccessOptions() {
  const sel = $('roleName');
  const prev = sel.value;
  const allowedRoles = ['school_admin', 'director', 'deputy', 'staff', 'teacher', 'maorif', 'authority_viewer'];
  sel.replaceChildren(...allowedRoles.map(r => new Option(roleDisplayLabel(r), r)));
  if (allowedRoles.includes(prev)) sel.value = prev;
  else sel.value = 'school_admin';
}

function showTab(name) {
  activeTab = name;
  for (const btn of document.querySelectorAll('.adm-tabs button')) {
    btn.setAttribute('aria-selected', btn.dataset.tab === name ? 'true' : 'false');
  }
  for (const pane of document.querySelectorAll('[data-pane]')) {
    pane.hidden = pane.dataset.pane !== name;
  }
}

function generateSchoolCode(name = '', current = '') {
  const numMatch = `${current} ${name}`.match(/(?:SM-|№\s*)(\d{1,3})/i);
  const prefix = numMatch ? `SM-${numMatch[1].padStart(3, '0')}` : 'SM';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, b => chars[b % chars.length]).join('');
  return `${prefix}-${suffix}`;
}

function renderEditBanner() {
  const banner = $('orgEditBanner');
  if (!editingOrgId) {
    banner.hidden = true;
    return;
  }
  const org = orgById(editingOrgId);
  banner.hidden = false;
  $('orgEditLabel').textContent = `${t('editingOrgPrefix')} ${org ? org.name : ''}${org?.school_code ? ` (${org.school_code})` : ''}`;
}

function startEditingOrg(org) {
  editingOrgId = org.id;
  $('orgName').value = org.name || '';
  $('orgTypePreset').value = orgTypeKey(org);
  $('orgRegion').value = org.region_name || '';
  $('orgDistrict').value = org.district_name || '';
  $('orgCode').value = org.school_code || '';
  renderOrgParentOptions(org.parent_id || '');
  renderEditBanner();
  $('orgName').focus();
}

function resetOrgEditor() {
  editingOrgId = null;
  $('orgForm').reset();
  $('orgTypePreset').value = 'school';
  renderOrgParentOptions();
  renderEditBanner();
}

function renderOrgParentOptions(explicitValue) {
  const preset = $('orgTypePreset').value;
  const region = $('orgRegion').value.trim();
  const district = normalizeDistrictInput($('orgDistrict').value);
  const parentSel = $('orgParent');
  const distInput = $('orgDistrict');

  if (preset === 'raesat') {
    distInput.disabled = true;
    parentSel.disabled = true;
    parentSel.replaceChildren(new Option('—', ''));
    return;
  }

  distInput.disabled = false;
  parentSel.disabled = false;

  const candidates = orgs.filter(o => {
    if (o.id === editingOrgId) return false;
    if (preset === 'maorif') return orgTypeKey(o) === 'raesat';
    return o.kind === 'education_authority';
  }).filter(o => !region || !o.region_name || o.region_name === region);

  candidates.sort((a, b) => {
    const score = item => {
      let s = 0;
      if (district && item.district_name === district) s -= 4;
      if (region && item.region_name === region) s -= 2;
      if (orgTypeKey(item) === 'maorif') s -= 1;
      return s;
    };
    return score(a) - score(b) || a.name.localeCompare(b.name, 'ru');
  });

  const prev = explicitValue !== undefined ? explicitValue : parentSel.value;
  parentSel.replaceChildren(
    new Option('—', ''),
    ...candidates.map(a => new Option(
      `${a.name}${a.district_name ? ` · ${a.district_name}` : (a.region_name ? ` · ${a.region_name}` : '')}`,
      a.id,
    )),
  );
  if (prev && candidates.some(c => c.id === prev)) {
    parentSel.value = prev;
  } else if (!editingOrgId && preset === 'school' && district) {
    const autoParent = candidates.find(c => orgTypeKey(c) === 'maorif' && c.district_name === district);
    if (autoParent) parentSel.value = autoParent.id;
  } else if (!editingOrgId && preset === 'maorif' && region) {
    const autoRaesat = candidates.find(c => orgTypeKey(c) === 'raesat' && c.region_name === region);
    if (autoRaesat) parentSel.value = autoRaesat.id;
  }
}

function showIssuedCredentials(data) {
  if (!data) {
    $('issuedAccessCard').hidden = true;
    return;
  }
  const org = orgById(data.organization_id);
  const posLabel = data.primary_position ? formatPositionTitle(data.primary_position, lang) : '';
  const extraList = Array.isArray(data.extra_positions) && data.extra_positions.length
    ? data.extra_positions.map(p => formatPositionTitle(p, lang)).join(', ')
    : '';
  const lines = [
    `${t('targetOrg')}: ${org ? org.name : '—'}${org?.school_code ? ` (${org.school_code})` : ''}`,
    posLabel ? `${t('primaryPosition')}: ${posLabel}` : null,
    extraList ? `${t('extraPositionsLabel')} ${extraList}` : null,
    data.max_devices ? `${t('maxDevices')}: ${data.max_devices}` : null,
    `${t('email')}: ${data.email || '—'}`,
    data.temporary_password ? `${t('tempPassword')}: ${data.temporary_password}` : null,
  ].filter(Boolean);
  $('issuedAccessTitle').textContent = t('issuedTitle');
  $('issuedAccessText').textContent = lines.join('\n');
  $('issuedAccessCard').hidden = false;
}

async function refreshAll() {
  if (!client.session?.access_token) return;
  try {
    const [o, m, l, pl, rt, p, ds, uRes] = await Promise.all([
      client.select('organizations', 'select=id,name,kind,parent_id,authority_tier,region_name,district_name,school_code&order=name.asc'),
      client.select('school_memberships', 'select=id,user_id,organization_id,role,primary_position,extra_positions,max_extra_positions,max_devices,account_active,aliya_enabled,custom_method_name,created_at&order=created_at.desc'),
      client.select('school_licenses', 'select=id,organization_id,status,plan_code,starts_at,expires_at,grace_days,max_accounts,max_positions_per_account,default_max_devices,notes,updated_at&order=updated_at.desc'),
      client.getPaymentPlans(),
      client.getRoleTariffs().catch(() => POSITION_CATALOG),
      client.select('payment_submissions', 'select=id,organization_id,submitted_by,provider_code,receipt_hash,amount_declared,currency,ocr_text,ocr_confidence,transaction_id,recipient_account,status_confirmed,plan_code,ocr_payload,status,review_note,created_at&order=created_at.desc'),
      client.select('user_device_sessions', 'select=id,user_id,organization_id,device_id,device_label,is_active,first_seen_at,last_seen_at&order=last_seen_at.desc').catch(() => []),
      client.adminUsers({ action: 'list_users' }).catch(() => ({ users: [] })),
    ]);
    orgs = o || [];
    memberships = m || [];
    licenses = l || [];
    plans = pl || [];
    roleTariffs = rt?.length ? rt : [...POSITION_CATALOG];
    payments = p || [];
    deviceSessions = ds || [];
    authUsers = Array.isArray(uRes?.users) ? uRes.users : [];
    renderSummaryBar();
    renderFilterSelects();
    renderDatalists();
    renderUserPicker();
    renderOrgSelects();
    renderOrgParentOptions();
    renderPositionControls();
    renderEditBanner();
    renderTables();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function renderDatalists() {
  const regions = uniqueSorted(orgs.map(o => o.region_name));
  const districts = uniqueSorted(orgs.map(o => o.district_name));
  $('regionDatalist').replaceChildren(...regions.map(r => Object.assign(document.createElement('option'), { value: r })));
  $('districtDatalist').replaceChildren(...districts.map(d => Object.assign(document.createElement('option'), { value: d })));
}

function renderFilterSelects() {
  const regions = uniqueSorted(orgs.map(o => o.region_name));
  const fReg = $('filterRegion');
  const prevFReg = fReg.value;
  fReg.replaceChildren(new Option(t('allRegions'), ''), ...regions.map(r => new Option(r, r)));
  if (regions.includes(prevFReg)) fReg.value = prevFReg;

  const districts = uniqueSorted(
    orgs.filter(o => !fReg.value || o.region_name === fReg.value).map(o => o.district_name),
  );
  const fDist = $('filterDistrict');
  const prevFDist = fDist.value;
  fDist.replaceChildren(new Option(t('allDistricts'), ''), ...districts.map(d => new Option(d, d)));
  if (districts.includes(prevFDist)) fDist.value = prevFDist;

  for (const regFilterId of ['roleRegionFilter', 'licRegionFilter']) {
    const sel = $(regFilterId);
    const prev = sel.value;
    sel.replaceChildren(new Option(t('allRegions'), ''), ...regions.map(r => new Option(r, r)));
    if (regions.includes(prev)) sel.value = prev;
  }
}

function renderUserPicker() {
  const sel = $('roleUserPick');
  const prev = sel.value;
  sel.replaceChildren(
    new Option(t('newAccountOption'), ''),
    ...authUsers.map(u => new Option(`${u.email || ''}${u.full_name ? ` · ${u.full_name}` : ''}`, u.id)),
  );
  if (authUsers.some(u => u.id === prev)) sel.value = prev;
}

function formatOrgOptionLabel(o) {
  const parts = [o.name];
  if (o.school_code) parts.push(`[${o.school_code}]`);
  if (o.district_name) parts.push(o.district_name);
  else if (o.region_name) parts.push(o.region_name);
  return parts.join(' · ');
}

function renderOrgSelects() {
  const roleRegion = $('roleRegionFilter').value;
  const roleOrgCandidates = orgs.filter(o => !roleRegion || o.region_name === roleRegion);
  const roleSel = $('roleOrg');
  const prevRole = roleSel.value;
  roleSel.replaceChildren(...roleOrgCandidates.map(o => new Option(formatOrgOptionLabel(o), o.id)));
  if (roleOrgCandidates.some(o => o.id === prevRole)) roleSel.value = prevRole;

  const licRegion = $('licRegionFilter').value;
  const licCandidates = orgs.filter(o => !licRegion || o.region_name === licRegion);
  const licSel = $('licOrg');
  const prevLic = licSel.value;
  licSel.replaceChildren(...licCandidates.map(o => new Option(formatOrgOptionLabel(o), o.id)));
  if (licCandidates.some(o => o.id === prevLic)) licSel.value = prevLic;
  renderOrgQuotaBanner();
}

function renderOrgQuotaBanner() {
  const orgId = $('roleOrg').value;
  const noteEl = $('roleOrgQuotaInfo');
  if (!orgId) {
    noteEl.textContent = '';
    return;
  }
  const lic = licenses.find(l => l.organization_id === orgId);
  const used = memberships.filter(m => m.organization_id === orgId && m.account_active !== false).length;
  const maxAcc = lic?.max_accounts ?? 1;
  const maxPos = lic?.max_positions_per_account ?? 1;
  const defDev = lic?.default_max_devices ?? 1;
  noteEl.textContent = t('orgQuotaLine')
    .replace('{used}', String(used))
    .replace('{max}', String(maxAcc))
    .replace('{pos}', String(maxPos))
    .replace('{dev}', String(defDev));
  noteEl.className = `adm-quota-note${used >= maxAcc ? ' warn' : ''}`;
}

function renderPositionControls() {
  const org = orgById($('roleOrg').value);
  const list = getPositionsForOrg(org, roleTariffs);
  const primarySel = $('rolePrimaryPos');
  const prevPrimary = primarySel.value;
  primarySel.replaceChildren(...list.map(p => {
    const title = lang === 'ru' ? p.title_ru : p.title_tg;
    const price = Number(p.base_price_tjs ?? 10).toFixed(2);
    const lockTag = p.can_receive_login === false ? ' [логин ⛔]' : '';
    return new Option(`${title} (${price} TJS)${lockTag}`, p.position_code);
  }));
  if (list.some(p => p.position_code === prevPrimary)) {
    primarySel.value = prevPrimary;
  } else if (list.length) {
    primarySel.value = list[0].position_code;
  }

  const chosenCode = primarySel.value;
  const chosenTariff = roleTariffs.find(r => r.position_code === chosenCode) || list[0];
  const loginHint = $('roleLoginAllowedHint');
  if (chosenTariff?.can_receive_login === false) {
    loginHint.textContent = t('loginForbiddenWarn');
    loginHint.style.color = 'var(--warn)';
  } else {
    loginHint.textContent = t('loginAllowedOk');
    loginHint.style.color = 'var(--sub)';
  }

  selectedExtraSet.delete(chosenCode);
  const extraBox = $('roleExtraPositionsBox');
  const extrasList = list.filter(p => p.position_code !== chosenCode);
  extraBox.replaceChildren(...extrasList.map(p => {
    const lbl = document.createElement('label');
    lbl.className = 'adm-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = p.position_code;
    cb.checked = selectedExtraSet.has(p.position_code);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedExtraSet.add(p.position_code);
      else selectedExtraSet.delete(p.position_code);
      if (Number($('roleMaxExtra').value || 0) < selectedExtraSet.size) {
        $('roleMaxExtra').value = String(selectedExtraSet.size);
      }
    });
    const span = document.createElement('span');
    span.textContent = `${lang === 'ru' ? p.title_ru : p.title_tg} (+${Number(p.extra_price_tjs ?? 5).toFixed(2)} TJS)`;
    lbl.append(cb, span);
    return lbl;
  }));
}

function loadMembershipIntoForm(m) {
  const u = userById(m.user_id);
  $('roleUserPick').value = u ? u.id : '';
  $('roleUserId').value = u?.login_name || (u?.email ? u.email.replace(/@login\.smartmaktab\.tj$/, '') : '');
  $('roleFullName').value = u?.full_name || '';
  if ($('roleAliyaEnabled')) $('roleAliyaEnabled').checked = m.aliya_enabled === true;
  $('roleRegionFilter').value = '';
  renderOrgSelects();
  $('roleOrg').value = m.organization_id;
  renderOrgQuotaBanner();
  selectedExtraSet = new Set(Array.isArray(m.extra_positions) ? m.extra_positions : []);
  renderPositionControls();
  if (m.primary_position && [...$('rolePrimaryPos').options].some(o => o.value === m.primary_position)) {
    $('rolePrimaryPos').value = m.primary_position;
  }
  renderPositionControls();
  $('roleName').value = m.role || 'school_admin';
  $('roleMaxExtra').value = String(m.max_extra_positions ?? selectedExtraSet.size ?? 0);
  $('roleMaxDevices').value = String(m.max_devices ?? 1);
  $('roleAccountActive').checked = m.account_active !== false;
  $('roleForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadLicenseIntoForm(l) {
  $('licRegionFilter').value = '';
  renderOrgSelects();
  $('licOrg').value = l.organization_id;
  $('licStatus').value = l.status || 'active';
  $('licPlan').value = l.plan_code || 'standard';
  $('licExpires').value = (l.expires_at || '').slice(0, 10) || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  $('licGraceDays').value = String(l.grace_days ?? 30);
  $('licMaxAccounts').value = String(l.max_accounts ?? 1);
  $('licMaxPos').value = String(l.max_positions_per_account ?? 1);
  $('licDefaultDev').value = String(l.default_max_devices ?? 1);
  $('licNotes').value = l.notes || '';
}

function filteredOrgs() {
  const reg = $('filterRegion').value;
  const dist = $('filterDistrict').value;
  const kindPreset = $('filterKind').value;
  const q = $('filterSearch').value.trim().toLowerCase();
  return orgs.filter(o => {
    if (reg && o.region_name !== reg) return false;
    if (dist && o.district_name !== dist) return false;
    if (kindPreset !== 'all' && orgTypeKey(o) !== kindPreset) return false;
    if (q) {
      const hay = `${o.name} ${o.school_code || ''} ${o.district_name || ''} ${o.region_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderTables() {
  // 1. Организации
  const shownOrgs = filteredOrgs();
  $('orgsCountInfo').textContent = t('showingCount').replace('{shown}', String(shownOrgs.length)).replace('{total}', String(orgs.length));

  const orgBody = $('orgsTbody');
  orgBody.replaceChildren(...(shownOrgs.length ? shownOrgs.map(o => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = o.name;
    td1.append(strong);
    if (o.school_code) {
      const codeEl = document.createElement('small');
      codeEl.textContent = ` · ${o.school_code}`;
      td1.append(codeEl);
    }

    const td2 = document.createElement('td');
    td2.textContent = orgTypeLabel(o);

    const td3 = document.createElement('td');
    td3.textContent = [o.region_name, o.district_name].filter(Boolean).join(' · ') || '—';

    const tdParent = document.createElement('td');
    tdParent.textContent = o.parent_id ? orgShortName(o.parent_id) : '—';

    const td4 = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'adm-row';
    actions.style.marginTop = '0';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn alt sm';
    editBtn.textContent = t('editOrg');
    editBtn.addEventListener('click', () => startEditingOrg(o));

    const roleBtn = document.createElement('button');
    roleBtn.type = 'button';
    roleBtn.className = 'btn sm';
    roleBtn.textContent = t('openRole');
    roleBtn.addEventListener('click', () => {
      $('roleRegionFilter').value = '';
      renderOrgSelects();
      $('roleOrg').value = o.id;
      renderOrgQuotaBanner();
      renderPositionControls();
      const firstPos = $('rolePrimaryPos').value;
      if (firstPos) $('roleName').value = getRoleForPosition(firstPos);
      showTab('roles');
      $('roleUserId').focus();
    });

    const licBtn = document.createElement('button');
    licBtn.type = 'button';
    licBtn.className = 'btn alt sm';
    licBtn.textContent = t('openLicense');
    licBtn.addEventListener('click', () => {
      $('licRegionFilter').value = '';
      renderOrgSelects();
      const existingLic = licenses.find(l => l.organization_id === o.id);
      if (existingLic) loadLicenseIntoForm(existingLic);
      else $('licOrg').value = o.id;
      showTab('licenses');
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn danger sm';
    delBtn.textContent = t('deleteOrg');
    delBtn.addEventListener('click', async () => {
      const loc = [o.region_name, o.district_name].filter(Boolean).join(' · ') || '—';
      if (!globalThis.confirm(t('confirmDeleteOrg').replace('{name}', o.name).replace('{loc}', loc))) return;
      delBtn.disabled = true;
      try {
        await client.adminDeleteOrganization(o.id, false);
        setStatus(t('deletedOrg'));
        if (editingOrgId === o.id) resetOrgEditor();
        await refreshAll();
      } catch (err) {
        if (String(err.message || '').includes('organization_has_data')) {
          if (globalThis.confirm(t('confirmForceDelete').replace('{name}', o.name))) {
            try {
              await client.adminDeleteOrganization(o.id, true);
              setStatus(t('deletedOrg'));
              if (editingOrgId === o.id) resetOrgEditor();
              await refreshAll();
              return;
            } catch (err2) {
              setStatus(err2.message, 'error');
            }
          }
        } else {
          setStatus(err.message, 'error');
        }
        delBtn.disabled = false;
      }
    });

    actions.append(editBtn, roleBtn, licBtn, delBtn);
    td4.append(actions);
    tr.append(td1, td2, td3, tdParent, td4);
    return tr;
  }) : [emptyRow(5)]));

  // 2. Пользователи и должности
  const memBody = $('rolesTbody');
  memBody.replaceChildren(...(memberships.length ? memberships.map(m => {
    const tr = document.createElement('tr');
    const u = userById(m.user_id);
    const td1 = document.createElement('td');
    const uTitle = document.createElement('strong');
    uTitle.textContent = u?.login_name || (u?.email ? u.email.replace(/@login\.smartmaktab\.tj$/, '') : '') || (lang === 'ru' ? 'Пользователь' : 'Корбар');
    td1.append(uTitle);
    if (u?.full_name) {
      td1.append(document.createElement('br'), document.createTextNode(u.full_name));
    }

    const td2 = document.createElement('td');
    const orgLine = document.createElement('strong');
    orgLine.textContent = orgShortName(m.organization_id);
    const posTitle = m.primary_position
      ? formatPositionTitle(m.primary_position, lang)
      : roleDisplayLabel(m.role);
    const extraTitles = (m.extra_positions || []).map(p => formatPositionTitle(p, lang));
    const posDiv = document.createElement('div');
    posDiv.textContent = `${posTitle}${extraTitles.length ? ` (+ ${extraTitles.join(', ')})` : ''}`;
    td2.append(orgLine, posDiv);

    const td3 = document.createElement('td');
    const activeDevCount = deviceSessions.filter(d => d.user_id === m.user_id && d.organization_id === m.organization_id && d.is_active !== false).length;
    const statusPill = document.createElement('span');
    statusPill.className = `pill${m.account_active === false ? ' danger' : ''}`;
    statusPill.textContent = m.account_active === false ? t('disabledBadge') : t('activeBadge');
    const quotaText = document.createElement('div');
    quotaText.textContent = lang === 'ru'
      ? `Устройства: ${activeDevCount}/${m.max_devices ?? 1} · Доп. роли: ${(m.extra_positions || []).length}/${m.max_extra_positions ?? 0}${m.aliya_enabled ? ' · Алия ✓' : ''}`
      : `Дастгоҳҳо: ${activeDevCount}/${m.max_devices ?? 1} · Иловагӣ: ${(m.extra_positions || []).length}/${m.max_extra_positions ?? 0}${m.aliya_enabled ? ' · Алия ✓' : ''}`;
    td3.append(statusPill, quotaText);

    const td4 = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'adm-row';
    wrap.style.marginTop = '0';

    const editUserBtn = document.createElement('button');
    editUserBtn.type = 'button';
    editUserBtn.className = 'btn sm';
    editUserBtn.textContent = t('editUser');
    editUserBtn.addEventListener('click', () => loadMembershipIntoForm(m));

    const resetDevBtn = document.createElement('button');
    resetDevBtn.type = 'button';
    resetDevBtn.className = 'btn alt sm';
    resetDevBtn.textContent = t('resetDevices');
    resetDevBtn.addEventListener('click', async () => {
      resetDevBtn.disabled = true;
      try {
        await client.adminResetUserDevices({ p_user_id: m.user_id, p_org_id: m.organization_id, p_device_id: null });
        setStatus(t('saved'));
        await refreshAll();
      } catch (err) {
        setStatus(err.message, 'error');
        resetDevBtn.disabled = false;
      }
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn alt sm';
    resetBtn.textContent = t('resetPassword');
    resetBtn.addEventListener('click', async () => {
      resetBtn.disabled = true;
      try {
        const res = await client.adminUsers({ action: 'reset_password', user_id: m.user_id });
        showIssuedCredentials({
          ...res,
          organization_id: m.organization_id,
          primary_position: m.primary_position,
          extra_positions: m.extra_positions,
          max_devices: m.max_devices,
        });
        setStatus(t('saved'));
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        resetBtn.disabled = false;
      }
    });

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn alt sm';
    rm.textContent = t('remove');
    rm.addEventListener('click', async () => {
      rm.disabled = true;
      try {
        await client.adminRemoveMembership(m.id);
        setStatus(t('saved'));
        await refreshAll();
      } catch (err) {
        setStatus(err.message, 'error');
        rm.disabled = false;
      }
    });
    wrap.append(editUserBtn, resetDevBtn, resetBtn, rm);
    td4.append(wrap);
    tr.append(td1, td2, td3, td4);
    return tr;
  }) : [emptyRow(4)]));

  // 2б. Активные устройства
  const devBody = $('devicesTbody');
  const activeDevices = deviceSessions.filter(d => d.is_active !== false);
  devBody.replaceChildren(...(activeDevices.length ? activeDevices.map(d => {
    const tr = document.createElement('tr');
    const u = userById(d.user_id);
    const m = memberships.find(x => x.user_id === d.user_id && x.organization_id === d.organization_id);
    const td1 = document.createElement('td');
    td1.textContent = `${u?.email || '—'} · ${orgShortName(d.organization_id)}`;
    const td2 = document.createElement('td');
    const pos = m?.primary_position ? formatPositionTitle(m.primary_position, lang) : roleDisplayLabel(m?.role);
    td2.textContent = `${d.device_label || 'Web'} · ${pos}`;
    const td3 = document.createElement('td');
    td3.textContent = (d.last_seen_at || '').replace('T', ' ').slice(0, 16);
    const td4 = document.createElement('td');
    const unlinkBtn = document.createElement('button');
    unlinkBtn.type = 'button';
    unlinkBtn.className = 'btn alt sm';
    unlinkBtn.textContent = t('unlinkDevice');
    unlinkBtn.addEventListener('click', async () => {
      unlinkBtn.disabled = true;
      try {
        await client.adminResetUserDevices({ p_user_id: d.user_id, p_org_id: d.organization_id, p_device_id: d.device_id });
        setStatus(t('saved'));
        await refreshAll();
      } catch (err) {
        setStatus(err.message, 'error');
        unlinkBtn.disabled = false;
      }
    });
    td4.append(unlinkBtn);
    tr.append(td1, td2, td3, td4);
    return tr;
  }) : [emptyRow(4)]));

  // 3. Лицензии
  const licBody = $('licensesTbody');
  licBody.replaceChildren(...(licenses.length ? licenses.map(l => {
    const evalState = evaluateLicenseState({ ...l, configured: true });
    const usedAcc = memberships.filter(m => m.organization_id === l.organization_id && m.account_active !== false).length;
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = `${orgShortName(l.organization_id)} (${l.plan_code})`;
    const td2 = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${evalState.status === 'locked' ? 'danger' : evalState.status === 'grace' ? 'warn' : ''}`;
    const rem = evalState.status === 'grace' ? evalState.graceDaysLeft : evalState.daysLeft;
    pill.textContent = `${licenseStatusLabel(evalState.status)} (${rem} ${lang === 'ru' ? 'дн.' : 'рӯз'})`;
    td2.append(pill);
    const td3 = document.createElement('td');
    td3.textContent = lang === 'ru'
      ? `Логины: ${usedAcc}/${l.max_accounts ?? 1} · Роли: ${l.max_positions_per_account ?? 1} · Устр.: ${l.default_max_devices ?? 1}`
      : `Логинҳо: ${usedAcc}/${l.max_accounts ?? 1} · Вазифа: ${l.max_positions_per_account ?? 1} · Дастгоҳ: ${l.default_max_devices ?? 1}`;
    const td4 = document.createElement('td');
    td4.textContent = l.expires_at?.slice(0, 10) || '—';
    const td5 = document.createElement('td');
    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'btn alt sm';
    pickBtn.textContent = t('editOrg');
    pickBtn.addEventListener('click', () => loadLicenseIntoForm(l));
    td5.append(pickBtn);
    tr.append(td1, td2, td3, td4, td5);
    return tr;
  }) : [emptyRow(5)]));

  // 4а. Базовый план и реквизиты
  if (plans[0] && !$('planTitleTg').value) {
    $('planCode').value = plans[0].code;
    $('planTitleTg').value = plans[0].title_tg;
    $('planTitleRu').value = plans[0].title_ru;
    $('planPrice').value = String(plans[0].price_tjs);
    $('planDays').value = String(plans[0].duration_days);
    $('planPhone').value = plans[0].recipient_phone;
  }

  // 4б. Индивидуальные тарифы должностей
  const tariffGroup = $('tariffGroupFilter').value;
  const tariffQ = $('tariffSearch').value.trim().toLowerCase();
  const filteredTariffs = roleTariffs.filter(rt => {
    if (tariffGroup !== 'all' && rt.group_code !== tariffGroup) return false;
    if (tariffQ) {
      const hay = `${rt.title_tg} ${rt.title_ru} ${rt.position_code}`.toLowerCase();
      if (!hay.includes(tariffQ)) return false;
    }
    return true;
  });

  const rtBody = $('roleTariffsTbody');
  rtBody.replaceChildren(...(filteredTariffs.length ? filteredTariffs.map(rt => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const st = document.createElement('strong');
    st.textContent = lang === 'ru' ? rt.title_ru : rt.title_tg;
    const altTitle = document.createElement('div');
    altTitle.className = 'adm-meta';
    altTitle.textContent = lang === 'ru' ? rt.title_tg : rt.title_ru;
    tdName.append(st, altTitle);

    const makeNum = (val, step = '1', min = '0', max = '99999') => {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = step;
      inp.min = min;
      inp.max = max;
      inp.className = 'adm-num-sm';
      inp.value = String(val);
      return inp;
    };
    const makeCb = checked => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked !== false;
      return cb;
    };

    const baseInp = makeNum(Number(rt.base_price_tjs ?? 10).toFixed(2), '0.01', '0', '10000');
    const extraInp = makeNum(Number(rt.extra_price_tjs ?? 5).toFixed(2), '0.01', '0', '10000');
    const daysInp = makeNum(rt.duration_days ?? 30, '1', '1', '3650');
    const devInp = makeNum(rt.default_max_devices ?? 1, '1', '1', '10');
    const canLoginCb = makeCb(rt.can_receive_login !== false);
    const activeCb = makeCb(rt.is_active !== false);

    const tdBase = document.createElement('td'); tdBase.append(baseInp);
    const tdExtra = document.createElement('td'); tdExtra.append(extraInp);
    const tdDays = document.createElement('td'); tdDays.append(daysInp);
    const tdDev = document.createElement('td'); tdDev.append(devInp);
    const tdLogin = document.createElement('td'); tdLogin.append(canLoginCb);
    const tdAct = document.createElement('td'); tdAct.append(activeCb);

    const tdSave = document.createElement('td');
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn sm';
    saveBtn.textContent = t('save');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        await client.adminUpsertRoleTariff({
          p_position_code: rt.position_code,
          p_base_price_tjs: Number(baseInp.value),
          p_extra_price_tjs: Number(extraInp.value),
          p_duration_days: Number(daysInp.value),
          p_default_max_devices: Number(devInp.value),
          p_can_receive_login: canLoginCb.checked,
          p_is_active: activeCb.checked,
        });
        setStatus(t('saved'));
        await refreshAll();
      } catch (err) {
        setStatus(err.message, 'error');
        saveBtn.disabled = false;
      }
    });
    tdSave.append(saveBtn);
    tr.append(tdName, tdBase, tdExtra, tdDays, tdDev, tdLogin, tdAct, tdSave);
    return tr;
  }) : [emptyRow(8)]));

  // 5. Платежи
  const payBody = $('paymentsTbody');
  payBody.replaceChildren(...(payments.length ? payments.map(p => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const mainPos = p.ocr_payload?.primary_position ? formatPositionTitle(p.ocr_payload.primary_position, lang) : '';
    const extraCnt = Array.isArray(p.ocr_payload?.extra_positions) ? p.ocr_payload.extra_positions.length : 0;
    const posStr = mainPos ? ` · ${mainPos}${extraCnt ? ` (+${extraCnt})` : ''}` : '';
    td1.textContent = `${orgShortName(p.organization_id)} · ${p.provider_code} · ${p.amount_declared ?? '—'} ${p.currency}${posStr}`;

    const td2 = document.createElement('td');
    const hashEl = document.createElement('small');
    const txPart = p.transaction_id ? ` · TX:${p.transaction_id}` : '';
    const recPart = p.recipient_account ? ` · ->${p.recipient_account}` : '';
    const okPart = p.status_confirmed ? ' · ✓' : '';
    const payStatusLabel = p.status === 'verified'
      ? (lang === 'ru' ? 'Подтверждён' : 'Тасдиқшуда')
      : p.status === 'rejected'
        ? (lang === 'ru' ? 'Отклонён' : 'Радшуда')
        : (lang === 'ru' ? 'Ожидает проверки' : 'Интизори тафтиш');
    hashEl.textContent = `${payStatusLabel}${txPart}${recPart}${okPart}`;
    const ocrEl = document.createElement('div');
    ocrEl.textContent = p.ocr_text ? p.ocr_text.slice(0, 160) : '—';
    td2.append(hashEl, ocrEl);

    const td3 = document.createElement('td');
    if (p.status === 'pending') {
      const wrap = document.createElement('div');
      wrap.className = 'adm-row';
      wrap.style.marginTop = '0';
      for (const [days, labelKey, cls] of [[30, 'approve30', 'btn sm'], [365, 'approve365', 'btn alt sm'], [0, 'reject', 'btn danger sm']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = t(labelKey);
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            await client.adminReviewPayment({
              p_payment_id: p.id,
              p_decision: days > 0 ? 'verified' : 'rejected',
              p_review_note: days > 0 ? `Verified +${days}d` : 'Rejected by admin',
              p_extend_days: days,
              p_plan_code: days >= 365 ? 'annual' : 'monthly',
            });
            setStatus(t('saved'));
            await refreshAll();
          } catch (err) {
            setStatus(err.message, 'error');
            b.disabled = false;
          }
        });
        wrap.append(b);
      }
      td3.append(wrap);
    } else {
      td3.textContent = p.review_note || payStatusLabel;
    }
    tr.append(td1, td2, td3);
    return tr;
  }) : [emptyRow(3)]));
}

function emptyRow(cols) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = cols;
  td.textContent = t('noRows');
  tr.append(td);
  return tr;
}

$('admLang').addEventListener('change', e => {
  lang = e.target.value;
  try { globalThis.localStorage?.setItem(LANG_STORAGE_KEY, lang); } catch {}
  applyTranslations();
});

for (const btn of document.querySelectorAll('.adm-tabs button')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

$('orgTypePreset').addEventListener('change', () => renderOrgParentOptions());
$('orgRegion').addEventListener('input', () => renderOrgParentOptions());
$('orgDistrict').addEventListener('input', () => renderOrgParentOptions());

$('filterRegion').addEventListener('change', () => {
  renderFilterSelects();
  renderTables();
});
$('filterDistrict').addEventListener('change', renderTables);
$('filterKind').addEventListener('change', renderTables);
$('filterSearch').addEventListener('input', renderTables);

$('tariffGroupFilter').addEventListener('change', renderTables);
$('tariffSearch').addEventListener('input', renderTables);

$('roleRegionFilter').addEventListener('change', () => {
  renderOrgSelects();
  renderPositionControls();
});
$('licRegionFilter').addEventListener('change', renderOrgSelects);

$('roleOrg').addEventListener('change', () => {
  renderOrgQuotaBanner();
  renderPositionControls();
  const firstPos = $('rolePrimaryPos').value;
  if (firstPos) $('roleName').value = getRoleForPosition(firstPos);
});

$('rolePrimaryPos').addEventListener('change', () => {
  const code = $('rolePrimaryPos').value;
  $('roleName').value = getRoleForPosition(code);
  const rt = roleTariffs.find(r => r.position_code === code);
  if (rt?.default_max_devices) $('roleMaxDevices').value = String(rt.default_max_devices);
  renderPositionControls();
});

$('roleUserPick').addEventListener('change', e => {
  const u = userById(e.target.value);
  if (!u) return;
  $('roleUserId').value = u.email || '';
  if (u.full_name) $('roleFullName').value = u.full_name;
});

$('orgGenCode').addEventListener('click', () => {
  $('orgCode').value = generateSchoolCode($('orgName').value, $('orgCode').value);
});
$('orgCancelEdit').addEventListener('click', resetOrgEditor);

$('copyAccessBtn').addEventListener('click', async () => {
  const txt = $('issuedAccessText').textContent;
  if (!txt) return;
  try {
    await navigator.clipboard.writeText(txt);
    setStatus(t('copiedCredentials'));
  } catch {
    setStatus(txt);
  }
});
$('closeAccessBtn').addEventListener('click', () => { $('issuedAccessCard').hidden = true; });

$('admLoginForm').addEventListener('submit', async e => {
  e.preventDefault();
  setStatus('');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await client.signIn($('loginEmail').value, $('loginPassword').value);
    $('loginPassword').value = '';
    const ctx = await client.getWorkspaceContext();
    if (!ctx?.is_super_admin) {
      await client.signOut();
      setStatus(t('needSuperAdmin'), 'error');
      return;
    }
    $('admLoginCard').hidden = true;
    $('admWorkspace').hidden = false;
    $('signOutBtn').hidden = false;
    $('reloadBtn').hidden = false;
    setStatus(t('signedIn'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('signOutBtn').addEventListener('click', async () => {
  await client.signOut();
  $('admLoginCard').hidden = false;
  $('admWorkspace').hidden = true;
  $('signOutBtn').hidden = true;
  $('reloadBtn').hidden = true;
  setStatus('');
});

$('reloadBtn').addEventListener('click', refreshAll);

$('orgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const preset = $('orgTypePreset').value;
  const { kind, authority_tier } = presetToKindTier(preset);
  const district = preset === 'raesat' ? null : (normalizeDistrictInput($('orgDistrict').value) || null);
  try {
    await client.adminUpsertOrganization({
      p_name: $('orgName').value.trim(),
      p_kind: kind,
      p_parent_id: preset === 'raesat' ? null : ($('orgParent').value || null),
      p_authority_tier: authority_tier,
      p_region_name: $('orgRegion').value.trim() || null,
      p_district_name: district,
      p_school_code: $('orgCode').value.trim() || null,
      p_org_id: editingOrgId || null,
    });
    resetOrgEditor();
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('roleForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('roleUserId').value.trim();
  const orgId = $('roleOrg').value;
  const primaryPos = $('rolePrimaryPos').value;
  const role = $('roleName').value;
  const extraPositions = [...selectedExtraSet].filter(c => c !== primaryPos);
  const maxExtra = Math.max(extraPositions.length, Number($('roleMaxExtra').value || 0));
  const maxDevices = Math.max(1, Number($('roleMaxDevices').value || 1));
  const accountActive = $('roleAccountActive').checked;
  const aliyaEnabled = $('roleAliyaEnabled')?.checked === true;
  const fullName = $('roleFullName').value.trim();
  const password = $('roleTempPassword').value.trim();
  const resetPass = $('roleResetPass').checked;

  try {
    const res = await client.adminUsers({
      action: 'assign_or_create',
      login: email,
      org_id: orgId,
      role,
      primary_position: primaryPos,
      extra_positions: extraPositions,
      max_extra_positions: maxExtra,
      max_devices: maxDevices,
      account_active: accountActive,
      aliya_enabled: aliyaEnabled,
      full_name: fullName,
      preferred_lang: lang,
      ...(password ? { password } : {}),
      reset_password: resetPass,
    });
    showIssuedCredentials(res);
    $('roleTempPassword').value = '';
    $('roleResetPass').checked = false;
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('licForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.adminSetLicense({
      p_org_id: $('licOrg').value,
      p_status: $('licStatus').value,
      p_plan_code: $('licPlan').value.trim() || 'standard',
      p_expires_at: new Date(`${$('licExpires').value}T23:59:59Z`).toISOString(),
      p_grace_days: Number($('licGraceDays').value || 30),
      p_notes: $('licNotes').value.trim(),
      p_max_accounts: Math.max(1, Number($('licMaxAccounts').value || 1)),
      p_max_positions_per_account: Math.max(1, Number($('licMaxPos').value || 1)),
      p_default_max_devices: Math.max(1, Number($('licDefaultDev').value || 1)),
    });
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('projectEndpoint').textContent = `${getCloudConfig().url} (${getCloudConfig().projectRef})`;
$('licExpires').value = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

$('sendRecoveryBtn').addEventListener('click', async () => {
  setStatus('');
  const email = $('loginEmail').value.trim();
  if (!email) return;
  try {
    await client.requestPasswordRecovery(email, location.href.split('#')[0]);
    setStatus(t('recoverySent'));
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('admPasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.updatePassword($('newPasswordInput').value);
    $('newPasswordInput').value = '';
    $('admPasswordCard').hidden = true;
    setStatus(t('saved'));
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('planForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.adminUpsertSubscriptionPlan({
      p_code: $('planCode').value.trim(),
      p_title_tg: $('planTitleTg').value.trim(),
      p_title_ru: $('planTitleRu').value.trim(),
      p_price_tjs: Number($('planPrice').value),
      p_duration_days: Number($('planDays').value),
      p_recipient_phone: $('planPhone').value.trim(),
      p_supported_providers: ['amonat', 'dcity'],
      p_is_active: true,
    });
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

(async function restoreUrlOrSession() {
  let authType = '';
  if (location.hash && location.hash.includes('access_token=')) {
    const params = new URLSearchParams(location.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    authType = params.get('type') || '';
    if (accessToken) {
      client.setSession({ access_token: accessToken, refresh_token: refreshToken || '' });
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  if (!client.session?.access_token) return;
  try {
    const ctx = await client.getWorkspaceContext();
    if (ctx?.is_super_admin) {
      $('admLoginCard').hidden = true;
      $('admWorkspace').hidden = false;
      $('signOutBtn').hidden = false;
      $('reloadBtn').hidden = false;
      if (authType === 'recovery' || authType === 'magiclink') $('admPasswordCard').hidden = false;
      setStatus(t('signedIn'));
      await refreshAll();
    } else {
      await client.signOut();
      setStatus(t('needSuperAdmin'), 'error');
    }
  } catch {
    await client.signOut();
  }
})();

applyTranslations();
showTab('orgs');
