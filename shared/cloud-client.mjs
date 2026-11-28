import { getCloudConfig } from './cloud-config.mjs';
import { detectDeviceKind } from './license-guard.mjs';
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
    try {
      const rpcRes = await fetchImpl(`${config.url}/rest/v1/rpc/get_registration_bootstrap`, {
        method: 'POST',
        headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (rpcRes.ok) {
        const rpcData = await rpcRes.json().catch(() => null);
        if (rpcData && Array.isArray(rpcData.schools)) {
          return rpcData;
        }
      }
    } catch {
      // Fallback to Edge Function below
    }
    const res = await fetchImpl(`${config.url}/functions/v1/register-user?action=bootstrap`, {
      method: 'GET',
      headers: { apikey: config.publishableKey },
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
    getTajikistanLocations: () => select('tajikistan_locations', 'select=id,region_name,district_name,jamoat_name,village_name&order=region_name.asc,district_name.asc'),
    submitAccountVerification: args => rpc('submit_account_verification', args),
    getPendingAccountVerifications: (orgId = null) => rpc('get_pending_account_verifications', { p_org_id: orgId }),
    reviewAccountVerification: args => rpc('review_account_verification', args),
    getPendingSchools: () => rpc('get_pending_schools'),
    claimDeviceSession: args => rpc('claim_device_session', { p_device_kind: detectDeviceKind(), ...(args || {}) }),
    getMyDeviceSessions: (orgId = null) => rpc('get_my_device_sessions', { p_org_id: orgId }),
    revokeMyDeviceSession: args => rpc('revoke_my_device_session', args),
    getManagedUsers: (orgId = null) => rpc('get_managed_users', { p_org_id: orgId }),
    manageResetUserDevices: args => rpc('manage_reset_user_devices', args),
    manageSetUserActive: args => rpc('manage_set_user_active', args),
    managerResetPassword: ({ user_id, org_id }) => invokeFunction('admin-users', { action: 'manager_reset_password', user_id, org_id }),
    managerDeleteUser: ({ user_id, org_id }) => invokeFunction('admin-users', { action: 'manager_delete_user', user_id, org_id }),
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
    getPositionDocumentLibrary: (positionCode, orgId = null) => rpc('get_position_document_library', { p_position_code: positionCode, p_org_id: orgId }),
    createUserDocumentFolder: name => rpc('create_user_document_folder', { p_name: name }),
    renameUserDocumentFolder: (id, name) => rpc('rename_user_document_folder', { p_id: id, p_name: name }),
    deleteUserDocumentFolder: id => rpc('delete_user_document_folder', { p_id: id }),
    toggleUserDocumentFavorite: (templateId, favorite = true) => rpc('toggle_user_document_favorite', { p_template_id: templateId, p_favorite: favorite }),
    copyTemplateToUserFolder: (templateId, folderId, customTitle = '') => rpc('copy_template_to_user_folder', { p_template_id: templateId, p_folder_id: folderId, p_custom_title: customTitle }),
    removeUserDocumentItem: itemId => rpc('remove_user_document_item', { p_item_id: itemId }),
    saveUserDocumentDraft: args => rpc('save_user_document_draft', args),
    resetUserDocumentDraft: itemId => rpc('reset_user_document_draft', { p_item_id: itemId }),
    logDocumentPrint: args => rpc('log_document_print', args),
    docStorage: payload => invokeFunction('doc-storage', payload),
    adminListDocumentCatalog: () => rpc('admin_list_document_catalog'),
    adminUpsertDocumentCategory: args => rpc('admin_upsert_document_category', args),
    adminDeleteDocumentCategory: id => rpc('admin_delete_document_category', { p_id: id }),
    adminUpsertDocumentSubcategory: args => rpc('admin_upsert_document_subcategory', args),
    adminDeleteDocumentSubcategory: id => rpc('admin_delete_document_subcategory', { p_id: id }),
    adminUpsertDocumentTemplate: args => rpc('admin_upsert_document_template', args),
    adminDeleteDocumentTemplate: id => rpc('admin_delete_document_template', { p_id: id }),
    adminListAdminManagers: () => rpc('admin_list_admin_managers'),
    adminUpsertAdminManager: args => rpc('admin_upsert_admin_manager', args),
    adminDeleteAdminManager: userId => rpc('admin_delete_admin_manager', { p_user_id: userId }),
    getSchoolColleaguesDirectory: (orgId = null) => rpc('get_school_colleagues_directory', { p_org_id: orgId }),
    submitStudentUpdateRequest: args => rpc('submit_student_update_request', args),
    reviewStudentUpdateRequest: args => rpc('review_student_update_request', args),
  };
}
