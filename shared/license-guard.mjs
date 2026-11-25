const CACHE_KEY = 'sm:license-cache-v1';
const MS_PER_DAY = 86_400_000;
const CLOCK_SKEW_TOLERANCE_MS = 3_600_000;

const copy = {
  graceBanner: [
    'Муҳлати иҷозатнома ба охир расид. Дастрасии муваққатии офлайн боқӣ мондааст:',
    'Срок лицензии истёк. Осталось дней временного офлайн-доступа:',
  ],
  days: ['рӯз', 'дн.'],
  lockTitle: ['Дастрасии мактаб маҳдуд карда шуд', 'Доступ организации приостановлен'],
  lockExpired: [
    'Муҳлати иҷозатнома ва 30 рӯзи давраи имтиёзӣ ба охир расид. Барои идома додан пардохтро тасдиқ кунед ё онлайн санҷед.',
    'Срок лицензии и 30-дневный льготный период истекли. Подтвердите оплату или выполните онлайн-проверку.',
  ],
  lockClock: [
    'Таърихи дастгоҳ ба ақиб баргардонида шудааст. Иҷозатномаро онлайн санҷед.',
    'Обнаружен перевод часов устройства назад. Выполните онлайн-проверку лицензии.',
  ],
  lockSuspended: [
    'Дастрасии муассиса аз ҷониби маъмур боздошта шудааст.',
    'Доступ организации приостановлен администратором.',
  ],
  verifyBtn: ['Тафтиши онлайн', 'Проверить онлайн'],
  receiptBtn: ['Ирсоли расиди пардохт', 'Отправить чек об оплате'],
};

export function evaluateLicenseState(record, nowMs = Date.now()) {
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
  if (nowMs <= graceEndMs && record.status !== 'expired') {
    const graceDaysLeft = Math.max(0, Math.ceil((graceEndMs - nowMs) / MS_PER_DAY));
    return { status: 'grace', allowed: true, reason: 'offline_grace', daysLeft: 0, graceDaysLeft, clockTampered: false };
  }
  return { status: 'locked', allowed: false, reason: 'grace_expired', daysLeft: 0, graceDaysLeft: 0, clockTampered: false };
}

export function cacheVerifiedLicense(orgId, serverStatus, storage = globalThis.localStorage, nowMs = Date.now()) {
  if (!orgId || !serverStatus) return null;
  const all = readAllLicenseCache(storage);
  const prev = all[orgId];
  const serverNowMs = serverStatus.server_now ? Date.parse(serverStatus.server_now) : nowMs;
  const entry = {
    configured: !!serverStatus.configured,
    organization_id: orgId,
    status: serverStatus.status || 'none',
    plan_code: serverStatus.plan_code || 'trial',
    expires_at: serverStatus.expires_at || null,
    grace_days: serverStatus.grace_days ?? 30,
    offline_token_version: serverStatus.offline_token_version ?? 1,
    lastVerifiedAt: new Date(serverNowMs || nowMs).toISOString(),
    maxSeenNowMs: Math.max(prev?.maxSeenNowMs || 0, serverNowMs || nowMs, nowMs),
  };
  all[orgId] = entry;
  storage?.setItem?.(CACHE_KEY, JSON.stringify(all));
  return entry;
}

function readAllLicenseCache(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(CACHE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

export function readCachedLicense(orgId, storage = globalThis.localStorage, nowMs = Date.now()) {
  if (!orgId) return null;
  const all = readAllLicenseCache(storage);
  const entry = all[orgId] || null;
  if (entry && nowMs > (entry.maxSeenNowMs || 0)) {
    entry.maxSeenNowMs = nowMs;
    try { storage?.setItem?.(CACHE_KEY, JSON.stringify(all)); } catch {}
  }
  return entry;
}

export function clearCachedLicense(orgId, storage = globalThis.localStorage) {
  if (!orgId) return;
  const all = readAllLicenseCache(storage);
  delete all[orgId];
  storage?.setItem?.(CACHE_KEY, JSON.stringify(all));
}

export function mountLicenseGate(container, { orgId, storage = globalThis.localStorage, onVerifyOnline, onOpenPayment } = {}) {
  const tg = () => document.documentElement.lang !== 'ru';
  const t = k => copy[k][tg() ? 0 : 1];
  const record = readCachedLicense(orgId, storage);
  const state = evaluateLicenseState(record);
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
    p.textContent = state.reason === 'clock_tampered' ? t('lockClock') : state.reason === 'suspended' ? t('lockSuspended') : t('lockExpired');
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
    if (typeof onOpenPayment === 'function') {
      const pay = document.createElement('button');
      pay.type = 'button';
      pay.className = 'button alt';
      pay.textContent = t('receiptBtn');
      pay.addEventListener('click', onOpenPayment);
      row.append(pay);
    }
    box.append(h, p, row);
    container.append(box);
  }
  return state;
}
