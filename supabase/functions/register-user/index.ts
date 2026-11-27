const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const LOGIN_EMAIL_DOMAIN = 'login.smartmaktab.tj';

const GROUP_A = new Set([
  'school-director',
  'school-academic-deputy',
  'school-upbringing-deputy',
  'school-primary-deputy',
  'school-military-preparation-deputy',
  'school-sozmon',
  'school-records-clerk',
]);
const GROUP_B = new Set(['school-facilities-head', 'school-canteen-head']);
const GROUP_C = new Set([
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
]);
const GROUP_D = new Set(['school-accountant']);

const SCHOOL_POSITIONS = new Set([...GROUP_A, ...GROUP_B, ...GROUP_C, ...GROUP_D]);

function canCombine(primary: string, extra: string): boolean {
  if (!primary || !extra || primary === extra) return false;
  if (GROUP_D.has(primary)) return false;
  if (GROUP_A.has(primary)) return SCHOOL_POSITIONS.has(extra) && extra !== 'school-director';
  if (GROUP_B.has(primary)) return GROUP_B.has(extra);
  if (GROUP_C.has(primary)) return GROUP_C.has(extra);
  return false;
}

function normalizeLogin(raw: string): { valid: boolean; email: string; display: string } {
  const text = (raw || '').trim();
  if (!text) return { valid: false, email: '', display: '' };
  if (text.includes('@')) {
    const email = text.toLowerCase();
    return {
      valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      email,
      display: email,
    };
  }
  const digits = text.replace(/[\s+()-]/g, '');
  const tjDigits = /^992(\d{9})$/.test(digits) ? digits.slice(3) : digits;
  const handle = /^\d{7,15}$/.test(tjDigits) ? tjDigits : text.toLowerCase().replace(/\s+/g, '');
  if (!/^[a-z0-9._-]{3,60}$/.test(handle)) {
    return { valid: false, email: '', display: text };
  }
  return {
    valid: true,
    email: `${handle}@${LOGIN_EMAIL_DOMAIN}`,
    display: text,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function serviceHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra,
  };
  if (key && !key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) {
    h.Authorization = `Bearer ${key}`;
  }
  return h;
}

async function sbFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: unknown; errMsg: string }> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  const errObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const errMsg = String(errObj?.message || errObj?.msg || errObj?.error_description || errObj?.error || '');
  return { ok: res.ok, status: res.status, data, errMsg };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: 'missing_supabase_env' });
    }

    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    }
    const action = req.method === 'GET'
      ? 'bootstrap'
      : (typeof body.action === 'string' ? body.action.trim() : 'register');

    if (action === 'bootstrap' || action === 'list_schools') {
      const rpcRes = await sbFetch(`${supabaseUrl}/rest/v1/rpc/get_registration_bootstrap`, {
        method: 'POST',
        headers: serviceHeaders(serviceKey),
        body: '{}',
      });
      if (!rpcRes.ok || !rpcRes.data || typeof rpcRes.data !== 'object') {
        return json(500, { error: rpcRes.errMsg || 'bootstrap_failed' });
      }
      return json(200, rpcRes.data);
    }

    if (action !== 'register') {
      return json(400, { error: 'unsupported_action' });
    }

    const loginParsed = normalizeLogin(typeof body.login === 'string' ? body.login : '');
    const password = typeof body.password === 'string' ? body.password : '';
    const rawOrgId = typeof body.organization_id === 'string' ? body.organization_id.trim() : '';
    const isUuidOrg = /^[0-9a-f-]{36}$/i.test(rawOrgId);
    const newSchoolRaw = body.new_school && typeof body.new_school === 'object' && !Array.isArray(body.new_school)
      ? (body.new_school as Record<string, unknown>)
      : null;
    const primaryPosition = typeof body.primary_position === 'string' ? body.primary_position.trim().toLowerCase() : '';
    const rawExtras = Array.isArray(body.extra_positions)
      ? body.extra_positions.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim().toLowerCase())
      : [];
    const extraPositions = [...new Set(rawExtras)].filter(p => p !== primaryPosition);
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 120) : '';
    const preferredLang = body.preferred_lang === 'ru' ? 'ru' : 'tg';
    const customMethodName = typeof body.custom_method_name === 'string' ? body.custom_method_name.trim().slice(0, 120) : '';
    const includeAliya = body.include_aliya === true;
    const profileDetails = body.profile_details && typeof body.profile_details === 'object' && !Array.isArray(body.profile_details)
      ? body.profile_details
      : {};
    const positionProfiles = body.position_profiles && typeof body.position_profiles === 'object' && !Array.isArray(body.position_profiles)
      ? body.position_profiles
      : {};

    if (!loginParsed.valid) return json(400, { error: 'invalid_login' });
    if (password.length < 6 || password.length > 128) return json(400, { error: 'password_too_short' });
    if (!SCHOOL_POSITIONS.has(primaryPosition)) return json(400, { error: 'invalid_primary_position' });
    if (!fullName) return json(400, { error: 'full_name_required' });
    for (const ex of extraPositions) {
      if (!canCombine(primaryPosition, ex)) {
        return json(400, { error: `incompatible_extra_position:${ex}` });
      }
    }

    if (!isUuidOrg) {
      if (!newSchoolRaw) return json(400, { error: 'invalid_school' });
      const schoolName = typeof newSchoolRaw.name === 'string' ? newSchoolRaw.name.trim() : '';
      const regionName = typeof newSchoolRaw.region_name === 'string' ? newSchoolRaw.region_name.trim() : '';
      const districtName = typeof newSchoolRaw.district_name === 'string' ? newSchoolRaw.district_name.trim() : '';
      if (schoolName.length < 2) return json(400, { error: 'school_name_required' });
      if (!regionName || !districtName) return json(400, { error: 'region_and_district_required' });
    }

    const createUserRes = await sbFetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify({
        email: loginParsed.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          login_name: loginParsed.display,
        },
      }),
    });
    const createdObj = createUserRes.data && typeof createUserRes.data === 'object' ? (createUserRes.data as Record<string, unknown>) : null;
    const userObj = (createdObj?.user && typeof createdObj.user === 'object' ? createdObj.user : createdObj) as Record<string, unknown> | null;
    const userId = typeof userObj?.id === 'string' ? userObj.id : '';

    if (!createUserRes.ok || !userId) {
      const msg = createUserRes.errMsg || 'create_user_failed';
      const status = createUserRes.status === 422 || /already|exists|registered/i.test(msg) ? 409 : 400;
      return json(status, { error: status === 409 ? 'login_already_exists' : msg });
    }

    const enrichedDetails = {
      ...profileDetails,
      requested_aliya: includeAliya,
    };

    const regRpc = await sbFetch(`${supabaseUrl}/rest/v1/rpc/service_register_account`, {
      method: 'POST',
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify({
        p_user_id: userId,
        p_org_id: isUuidOrg ? rawOrgId : null,
        p_new_school: isUuidOrg ? null : newSchoolRaw,
        p_primary_position: primaryPosition,
        p_extra_positions: extraPositions,
        p_full_name: fullName,
        p_preferred_lang: preferredLang,
        p_login_name: loginParsed.display,
        p_custom_method_name: customMethodName,
        p_profile_details: enrichedDetails,
        p_position_profiles: positionProfiles,
      }),
    });

    const regData = regRpc.data && typeof regRpc.data === 'object' ? (regRpc.data as Record<string, unknown>) : null;
    if (!regRpc.ok || !regData?.school) {
      try {
        await sbFetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: serviceHeaders(serviceKey),
        });
      } catch {}
      const errCode = regRpc.errMsg || 'register_account_failed';
      const status = errCode === 'school_not_found'
        ? 404
        : /^(invalid_school|school_name_required|region_and_district_required|invalid_parent_authority|position_unavailable|invalid_primary_position)$/.test(errCode)
          ? 400
          : 500;
      return json(status, { error: errCode });
    }

    const signKey = publicKey || serviceKey;
    const signRes = await sbFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: serviceHeaders(signKey),
      body: JSON.stringify({
        email: loginParsed.email,
        password,
      }),
    });
    const signObj = signRes.data && typeof signRes.data === 'object' ? (signRes.data as Record<string, unknown>) : null;
    if (!signRes.ok || !signObj?.access_token) {
      return json(201, {
        user_id: userId,
        email: loginParsed.email,
        login_name: loginParsed.display,
        school: regData.school,
        verification_status: 'unverified',
        subscription_expires_at: regData.trial_expires_at ?? null,
        session: null,
      });
    }

    return json(200, {
      user_id: userId,
      email: loginParsed.email,
      login_name: loginParsed.display,
      school: regData.school,
      verification_status: 'unverified',
      subscription_expires_at: regData.trial_expires_at ?? null,
      session: signObj,
      user: signObj.user ?? null,
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'internal_error' });
  }
});
