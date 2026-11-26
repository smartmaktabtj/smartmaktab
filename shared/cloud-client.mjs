import { getCloudConfig } from './cloud-config.mjs';
import { normalizeLoginIdentifier } from './position-catalog.mjs';

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

  async function signIn(identifier, password) {
    const parsed = normalizeLoginIdentifier(identifier);
    const email = parsed.valid ? parsed.email : String(identifier || '').trim();
    const res = await fetchImpl(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers({}, false),
      body: JSON.stringify({ email, password: String(password || '') }),
    });
    const data = await parseJson(res);
    persistSession(data);
    return data;
  }

  async function fetchRegistrationBootstrap() {
    const res = await fetchImpl(`${config.url}/functions/v1/register-user?action=bootstrap`, {
      method: 'GET',
      headers: headers({}, false),
    });
    return parseJson(res);
  }

  async function registerUser(payload) {
    const res = await fetchImpl(`${config.url}/functions/v1/register-user`, {
      method: 'POST',
      headers: headers({}, false),
      body: JSON.stringify({ action: 'register', ...(payload || {}) }),
    });
    const data = await parseJson(res);
    if (data?.session?.access_token) {
      persistSession(data.session);
    }
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

  async function invokeFunction(slug, body = {}) {
    return authedFetch(`${config.url}/functions/v1/${slug}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  return {
    get config() { return config; },
    get session() { return session; },
    setSession(next) { persistSession(next); },
    refreshSession,
    signIn,
    signOut,
    fetchRegistrationBootstrap,
    registerUser,
    requestPasswordRecovery,
    updatePassword,
    rpc,
    select,
    invokeFunction,
    getWorkspaceContext: () => rpc('get_my_workspace_context'),
    upsertMyPositionProfiles: args => rpc('upsert_my_position_profiles', args),
    saveRecord: args => rpc('save_school_record', args),
    setRecordDeleted: args => rpc('set_school_record_deleted', args),
    listRecordsDetail: args => rpc('get_school_records_detail', args),
    submitSummary: args => rpc('submit_summary', args),
    reviewSummary: args => rpc('review_summary', args),
    territorySummary: args => rpc('territory_summary', args),
    getLicenseStatus: orgId => rpc('get_license_status', { p_org_id: orgId }),
    getPaymentPlans: () => select('subscription_plans', 'select=code,title_tg,title_ru,price_tjs,duration_days,recipient_phone,recipient_account,supported_providers,is_active&order=price_tjs.asc'),
    getRoleTariffs: () => select('role_tariffs', 'select=position_code,group_code,access_role,title_tg,title_ru,base_price_tjs,extra_price_tjs,duration_days,default_max_devices,can_receive_login,is_active,sort_order&order=sort_order.asc'),
    claimDeviceSession: args => rpc('claim_device_session', args),
    manageLibraryBook: args => rpc('manage_library_book', args),
    manageLibraryLoan: args => rpc('manage_library_loan', args),
    adminUpsertOrganization: args => rpc('admin_upsert_organization', args),
    adminDeleteOrganization: (orgId, force = false) => rpc('admin_delete_organization', { p_org_id: orgId, p_force: force }),
    adminAssignMembership: args => rpc('admin_assign_membership', args),
    adminRemoveMembership: id => rpc('admin_remove_membership', { p_membership_id: id }),
    adminResetUserDevices: args => rpc('admin_reset_user_devices', args),
    adminSetLicense: args => rpc('admin_set_license', args),
    adminReviewPayment: args => rpc('admin_review_payment', args),
    adminUpsertSubscriptionPlan: args => rpc('admin_upsert_subscription_plan', args),
    adminUpsertRoleTariff: args => rpc('admin_upsert_role_tariff', args),
    adminUsers: payload => invokeFunction('admin-users', payload),
    adminListContentRevisions: () => rpc('admin_list_content_revisions'),
    adminSaveContentRevision: args => rpc('admin_save_content_revision', args),
    adminRollbackContentRevision: args => rpc('admin_rollback_content_revision', args),
    adminMarkContentPublished: args => rpc('admin_mark_content_published', args),
  };
}
