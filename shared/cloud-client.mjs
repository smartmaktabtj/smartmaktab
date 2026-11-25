import { getCloudConfig } from './cloud-config.mjs';

export function createCloudClient({ config = getCloudConfig(), fetchImpl = globalThis.fetch } = {}) {
  let session = null;

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
    session = data;
    return data;
  }

  async function signOut() {
    if (!session?.access_token) {
      session = null;
      return;
    }
    try {
      await fetchImpl(`${config.url}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: headers(),
      });
    } finally {
      session = null;
    }
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
    if (!session?.access_token) throw new Error('Not signed in');
    const res = await fetchImpl(`${config.url}/auth/v1/user`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ password: String(newPassword || '') }),
    });
    return parseJson(res);
  }

  async function rpc(fnName, params = {}) {
    if (!session?.access_token) throw new Error('Not signed in');
    const res = await fetchImpl(`${config.url}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(params),
    });
    return parseJson(res);
  }

  async function select(table, queryString = '') {
    if (!session?.access_token) throw new Error('Not signed in');
    const res = await fetchImpl(`${config.url}/rest/v1/${table}${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: headers(),
    });
    return parseJson(res);
  }

  return {
    get config() { return config; },
    get session() { return session; },
    setSession(next) { session = next; },
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
