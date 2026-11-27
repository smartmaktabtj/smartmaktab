import { formatPositionTitle, isCabinetPermitted } from './position-catalog.mjs';

const CACHE_KEY = 'sm:license-cache-v1';
const DEVICE_KEY = 'smartmaktab.device.id.v1';
const MS_PER_DAY = 86_400_000;
const CLOCK_SKEW_TOLERANCE_MS = 3_600_000;

const copy = {
  graceBanner: [
    'Муҳлати иҷозатнома ба охир расид. Дастрасии муваққатии офлайн боқӣ мондааст:',
    'Срок лицензии истёк. Осталось дней временного офлайн-доступа:',
  ],
  days: ['рӯз', 'дн.'],
  lockTitle: ['Дастрасии мактаб маҳдуд карда шуд', 'Доступ ограничен'],
  lockExpired: [
    'Муҳлати иҷозатнома ба охир расид. Барои идома додан пардохтро тасдиқ кунед ё онлайн санҷед.',
    'Срок подписки истёк. Подтвердите оплату или выполните онлайн-проверку.',
  ],
  lockTrialExpired: [
    'Моҳи аввали ройгон ба анҷом расид. Барои идомаи кор бо барнома обунаро пардохт кунед.',
    'Первый бесплатный месяц завершён. Для продолжения работы с программой оплатите подписку.',
  ],
  payPrimaryOnlyNote: [
    'Пардохти обуна танҳо аз тирезаи вазифаи асосии шумо анҷом дода мешавад:',
    'Оплата подписки выполняется только в окне вашей основной должности:',
  ],
  lockClock: [
    'Таърихи дастгоҳ ба ақиб баргардонида шудааст. Иҷозатномаро онлайн санҷед.',
    'Обнаружен перевод часов устройства назад. Выполните онлайн-проверку лицензии.',
  ],
  lockSuspended: [
    'Дастрасии муассиса аз ҷониби маъмур боздошта шудааст.',
    'Доступ организации приостановлен администратором.',
  ],
  lockDeviceLimit: [
    'Ин логин ва парол аллакай дар дигар дастгоҳ фаъол аст (маҳдудияти дастгоҳҳо). Расонидани логин ба кормандони дигар иҷозат дода намешавад.',
    'Этот логин и пароль уже используются на максимальном числе устройств. Передача аккаунта другим сотрудникам запрещена — обратитесь к администратору для отвязки старого устройства.',
  ],
  lockPosition: [
    'Ин утоқ ба вазифаи пардохтшудаи шумо дохил намешавад. Вазифаи иловагиро дар бахши обуна пайваст кунед.',
    'Этот кабинет не входит в оплаченный набор должностей вашего аккаунта. Подключите дополнительную должность по тарифу.',
  ],
  lockDisabled: [
    'Дастрасии ин ҳисоб аз ҷониби маъмур қатъ карда шудааст.',
    'Этот аккаунт отключён администратором.',
  ],
  allowedPositionPrefix: [
    'Вазифаи фаъоли шумо:',
    'Ваша активная должность:',
  ],
  verifyBtn: ['Тафтиши онлайн', 'Проверить онлайн'],
  receiptBtn: ['Обуна ва пардохт', 'Тариф и оплата'],
};

export function getOrCreateDeviceId(storage) {
  const store = safeStorage(storage);
  try {
    const existing = store?.getItem?.(DEVICE_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {}
  let next = '';
  try {
    if (globalThis.crypto?.randomUUID) next = `dev-${globalThis.crypto.randomUUID()}`;
  } catch {}
  if (!next) {
    const bytes = new Uint8Array(16);
    try { globalThis.crypto.getRandomValues(bytes); } catch {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    next = `dev-${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }
  try { store?.setItem?.(DEVICE_KEY, next); } catch {}
  return next;
}

export function evaluateLicenseState(record, nowMs = Date.now(), cabinetId = '') {
  if (record?.accountDisabled) {
    return { status: 'locked', allowed: false, reason: 'account_disabled', daysLeft: 0, graceDaysLeft: 0, clockTampered: false };
  }
  if (record?.deviceBlocked) {
    return {
      status: 'locked',
      allowed: false,
      reason: 'device_limit_reached',
      daysLeft: 0,
      graceDaysLeft: 0,
      clockTampered: false,
      maxDevices: record.max_devices ?? 1,
    };
  }
  if (cabinetId && record && !record.is_super_admin && (record.primary_position || record.role)) {
    const permitted = isCabinetPermitted({
      primary_position: record.primary_position || null,
      extra_positions: record.extra_positions || [],
      role: record.role || '',
      account_active: !record.accountDisabled,
    }, cabinetId);
    if (!permitted) {
      return {
        status: 'locked',
        allowed: false,
        reason: 'position_not_allowed',
        daysLeft: 0,
        graceDaysLeft: 0,
        clockTampered: false,
        primaryPosition: record.primary_position || null,
      };
    }
  }
  if (!record || !record.configured) {
    return { status: 'unconfigured', allowed: true, reason: 'no_cloud_license', daysLeft: 0, graceDaysLeft: 30, clockTampered: false };
  }
  const lastVerifiedMs = record.lastVerifiedAt ? Date.parse(record.lastVerifiedAt) : 0;
  const maxSeenMs = Math.max(lastVerifiedMs || 0, Number(record.maxSeenNowMs) || 0);
  if (maxSeenMs && nowMs + CLOCK_SKEW_TOLERANCE_MS < maxSeenMs) {
    return { status: 'locked', allowed: false, reason: 'clock_tampered', daysLeft: 0, graceDaysLeft: 0, clockTampered: true };
  }
  if (record.status === 'suspended') {
    return { status: 'locked', allowed: false, reason: 'suspended', daysLeft: 0, graceDaysLeft: 0, clockTampered: false };
  }
  const expiresMs = Date.parse(record.expires_at);
  const graceDays = Number.isFinite(record.grace_days) ? Math.max(0, Math.min(90, Number(record.grace_days))) : 30;
  if (!Number.isFinite(expiresMs)) {
    return { status: 'locked', allowed: false, reason: 'invalid_license', daysLeft: 0, graceDaysLeft: 0, clockTampered: false };
  }
  const graceEndMs = expiresMs + graceDays * MS_PER_DAY;
  if (nowMs <= expiresMs && (record.status === 'active' || record.status === 'trial')) {
    const daysLeft = Math.max(0, Math.ceil((expiresMs - nowMs) / MS_PER_DAY));
    return { status: record.status, allowed: true, reason: 'valid', daysLeft, graceDaysLeft: graceDays, clockTampered: false };
  }
  if (graceDays > 0 && nowMs <= graceEndMs && record.status !== 'expired') {
    const graceDaysLeft = Math.max(0, Math.ceil((graceEndMs - nowMs) / MS_PER_DAY));
    return { status: 'grace', allowed: true, reason: 'offline_grace', daysLeft: 0, graceDaysLeft, clockTampered: false };
  }
  return {
    status: 'locked',
    allowed: false,
    reason: record.status === 'trial' ? 'trial_expired' : 'grace_expired',
    daysLeft: 0,
    graceDaysLeft: 0,
    clockTampered: false,
  };
}

function safeStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function cacheVerifiedLicense(orgId, serverStatus, storage, nowMs = Date.now()) {
  if (!orgId || !serverStatus) return null;
  const store = safeStorage(storage);
  const all = readAllLicenseCache(store);
  const prev = all[orgId];
  const serverNowMs = serverStatus.server_now ? Date.parse(serverStatus.server_now) : nowMs;
  const entry = {
    ...(prev || {}),
    configured: serverStatus.configured ?? prev?.configured ?? false,
    organization_id: orgId,
    status: serverStatus.status ?? prev?.status ?? 'none',
    plan_code: serverStatus.plan_code ?? prev?.plan_code ?? 'trial',
    expires_at: serverStatus.expires_at ?? prev?.expires_at ?? null,
    grace_days: serverStatus.grace_days ?? prev?.grace_days ?? 30,
    offline_token_version: serverStatus.offline_token_version ?? prev?.offline_token_version ?? 1,
    primary_position: serverStatus.primary_position !== undefined ? serverStatus.primary_position : (prev?.primary_position ?? null),
    extra_positions: serverStatus.extra_positions !== undefined ? serverStatus.extra_positions : (prev?.extra_positions ?? []),
    role: serverStatus.role !== undefined ? serverStatus.role : (prev?.role ?? ''),
    max_devices: serverStatus.max_devices !== undefined ? serverStatus.max_devices : (prev?.max_devices ?? 1),
    is_super_admin: serverStatus.is_super_admin !== undefined ? Boolean(serverStatus.is_super_admin) : Boolean(prev?.is_super_admin),
    deviceBlocked: serverStatus.deviceBlocked !== undefined ? Boolean(serverStatus.deviceBlocked) : false,
    accountDisabled: serverStatus.accountDisabled !== undefined ? Boolean(serverStatus.accountDisabled) : false,
    lastVerifiedAt: new Date(serverNowMs || nowMs).toISOString(),
    maxSeenNowMs: Math.max(prev?.maxSeenNowMs || 0, serverNowMs || nowMs, nowMs),
  };
  all[orgId] = entry;
  try { store?.setItem?.(CACHE_KEY, JSON.stringify(all)); } catch {}
  return entry;
}

function readAllLicenseCache(storage) {
  try {
    const store = safeStorage(storage);
    const raw = store?.getItem?.(CACHE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

export function readCachedLicense(orgId, storage, nowMs = Date.now()) {
  if (!orgId) return null;
  const store = safeStorage(storage);
  const all = readAllLicenseCache(store);
  const entry = all[orgId] || null;
  if (entry && nowMs > (entry.maxSeenNowMs || 0)) {
    entry.maxSeenNowMs = nowMs;
    try { store?.setItem?.(CACHE_KEY, JSON.stringify(all)); } catch {}
  }
  return entry;
}

export function clearCachedLicense(orgId, storage) {
  if (!orgId) return;
  const store = safeStorage(storage);
  const all = readAllLicenseCache(store);
  delete all[orgId];
  try { store?.setItem?.(CACHE_KEY, JSON.stringify(all)); } catch {}
}

export function mountLicenseGate(container, { orgId, cabinetId = '', storage, onVerifyOnline, onOpenPayment, isPrimaryPosition = true, primaryPosition = null } = {}) {
  const lang = document.documentElement.lang === 'ru' ? 'ru' : 'tg';
  const tg = () => lang === 'tg';
  const t = k => copy[k][tg() ? 0 : 1];
  const record = readCachedLicense(orgId, safeStorage(storage));
  const state = evaluateLicenseState(record, Date.now(), cabinetId);
  container.replaceChildren();
  container.hidden = state.allowed && state.status !== 'grace';

  if (state.status === 'grace') {
    const banner = document.createElement('div');
    banner.className = 'notice sm-license-grace';
    banner.textContent = `${t('graceBanner')} ${state.graceDaysLeft} ${t('days')}`;
    container.append(banner);
    return state;
  }

  if (!state.allowed) {
    const box = document.createElement('section');
    box.className = 'sm-license-lock';
    box.setAttribute('role', 'alertdialog');
    const h = document.createElement('h2');
    h.textContent = t('lockTitle');
    const p = document.createElement('p');
    if (state.reason === 'clock_tampered') p.textContent = t('lockClock');
    else if (state.reason === 'suspended') p.textContent = t('lockSuspended');
    else if (state.reason === 'device_limit_reached') p.textContent = t('lockDeviceLimit');
    else if (state.reason === 'account_disabled') p.textContent = t('lockDisabled');
    else if (state.reason === 'trial_expired') p.textContent = t('lockTrialExpired');
    else if (state.reason === 'position_not_allowed') {
      const posLabel = state.primaryPosition ? ` (${t('allowedPositionPrefix')} ${formatPositionTitle(state.primaryPosition, lang)})` : '';
      p.textContent = `${t('lockPosition')}${posLabel}`;
    } else {
      p.textContent = t('lockExpired');
    }
    if (!isPrimaryPosition && (primaryPosition || record?.primary_position)) {
      const noteP = document.createElement('p');
      noteP.className = 'small';
      const primCode = primaryPosition || record?.primary_position;
      noteP.textContent = `${t('payPrimaryOnlyNote')} ${formatPositionTitle(primCode, lang)}`;
      box.append(h, p, noteP);
    } else {
      box.append(h, p);
    }
    const row = document.createElement('div');
    row.className = 'control';
    if (typeof onVerifyOnline === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button';
      btn.textContent = t('verifyBtn');
      btn.addEventListener('click', onVerifyOnline);
      row.append(btn);
    }
    if (isPrimaryPosition && typeof onOpenPayment === 'function') {
      const pay = document.createElement('button');
      pay.type = 'button';
      pay.className = 'button alt';
      pay.textContent = t('receiptBtn');
      pay.addEventListener('click', onOpenPayment);
      row.append(pay);
    }
    box.append(row);
    container.append(box);
  }
  return state;
}
