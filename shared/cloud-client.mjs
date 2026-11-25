import { getCloudConfig } from './cloud-config.mjs';

export function createCloudClient({
  config = getCloudConfig(),
  fetchImpl = globalThis.fetch,
  storage = null,
  storageKey = 'smartmaktab.cloud.session.v1',
} = {}) {
  function readStoredSession() {
    if (!storage?.getItem) return null;
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.access_token === 'string' && parsed.access_token ? parsed : null;
    } catch {
      return null;
    }
  }

  let session = readStoredSession();

  function persistSession(next) {
    session = next && typeof next.access_token === 'string' && next.access_token ? next : null;
    if (!storage) return;
    try {
      if (session) storage.setItem(storageKey, JSON.stringify(session));
      else storage.removeItem?.(storageKey);
    } catch {}
  }

  function headers(extra = {}, includeAuth = true) {
    const h = {
      apikey: config.publishableKey,
      'Content-Type': 'application/json',
      ...extra,
    };
    if (includeAuth && session?.access_token) {
      h.Authorization = `Bearer ${session.access_token}`;
    }
    return h;
  }

  async function parseJson(res) {
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error_description || data?.message || data?.msg || data?.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  async function signIn(email, password) {
    const res = await fetchImpl(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers({}, false),
      body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }),
    });
    const data = await parseJson(res);
    persistSession(data);
    return data;
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    const res = await fetchImpl(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: headers({}, false),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await parseJson(res);
    persistSession(data);
    return data;
  }

  async function ensureFreshSession() {
    if (!session?.access_token) return;
    const expiresAtSec = Number(session.expires_at);
    if (Number.isFinite(expiresAtSec) && expiresAtSec * 1000 - Date.now() < 60_000 && session.refresh_token) {
      try {
        await refreshSession();
      } catch {
        persistSession(null);
      }
    }
  }

  async function authedFetch(url, init) {
    await ensureFreshSession();
    if (!session?.access_token) throw new Error('Not signed in');
    let res = await fetchImpl(url, { ...init, headers: headers(init?.headers || {}) });
    if (res.status === 401 && session?.refresh_token) {
      try {
        await refreshSession();
        res = await fetchImpl(url, { ...init, headers: headers(init?.headers || {}) });
      } catch {
        persistSession(null);
      }
    }
    return parseJson(res);
  }

  async function signOut() {
    const token = session?.access_token;
    persistSession(null);
    if (!token) return;
    try {
      await fetchImpl(`${config.url}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch {}
  }

  async function requestPasswordRecovery(email, redirectTo = '') {
    const body = { email: String(email || '').trim() };
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
    const res = await fetchImpl(`${config.url}/auth/v1/recover${query}`, {
      method: 'POST',
      headers: headers({}, false),
      body: JSON.stringify(body),
    });
    return parseJson(res);
  }

  async function updatePassword(newPassword) {
    return authedFetch(`${config.url}/auth/v1/user`, {
      method: 'PUT',
      body: JSON.stringify({ password: String(newPassword || '') }),
    });
  }

  async function rpc(fnName, params = {}) {
    return authedFetch(`${config.url}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async function select(table, queryString = '') {
    return authedFetch(`${config.url}/rest/v1/${table}${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  }

  return {
    get config() { return config; },
    get session() { return session; },
    setSession(next) { persistSession(next); },
    refreshSession,
    signIn,
    signOut,
    requestPasswordRecovery,
    updatePassword,
    rpc,
    select,
    getWorkspaceContext: () => rpc('get_my_workspace_context'),
    saveRecord: args => rpc('save_school_record', args),
    setRecordDeleted: args => rpc('set_school_record_deleted', args),
    listRecordsDetail: args => rpc('get_school_records_detail', args),
    submitSummary: args => rpc('submit_summary', args),
    reviewSummary: args => rpc('review_summary', args),
    territorySummary: args => rpc('territory_summary', args),
    getLicenseStatus: orgId => rpc('get_license_status', { p_org_id: orgId }),
    getPaymentPlans: () => select('subscription_plans', 'select=code,title_tg,title_ru,price_tjs,duration_days,recipient_phone,recipient_account,supported_providers,is_active&order=price_tjs.asc'),
    manageLibraryBook: args => rpc('manage_library_book', args),
    manageLibraryLoan: args => rpc('manage_library_loan', args),
    adminUpsertOrganization: args => rpc('admin_upsert_organization', args),
    adminAssignMembership: args => rpc('admin_assign_membership', args),
    adminRemoveMembership: id => rpc('admin_remove_membership', { p_membership_id: id }),
    adminSetLicense: args => rpc('admin_set_license', args),
    adminReviewPayment: args => rpc('admin_review_payment', args),
    adminUpsertSubscriptionPlan: args => rpc('admin_upsert_subscription_plan', args),
  };
}
