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

function normDistrict(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^(?:ш\.|н\.|шаҳри|ноҳияи|г\.|р-н)\s+/i, '')
    .replace(/\s+/g, ' ');
}

function canonRegion(s: string): string {
  const low = String(s || '').trim().toLowerCase();
  if (!low) return '';
  if (low.includes('суғд') || low.includes('сугд')) return 'суғд';
  if (low.includes('хатлон')) return 'хатлон';
  if (low.includes('душанбе')) return 'душанбе';
  if (low.includes('вмкб') || low.includes('бадахшон')) return 'вмкб';
  if (low.includes('тобе') || low.includes('нтҷ') || low.includes('нтм')) return 'нтҷ';
  return low;
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
      if (rpcRes.ok && rpcRes.data && typeof rpcRes.data === 'object' && Array.isArray((rpcRes.data as Record<string, unknown>).schools)) {
        return json(200, rpcRes.data);
      }

      const [schRes, authRes, tarRes, locRes] = await Promise.all([
        sbFetch(
          `${supabaseUrl}/rest/v1/organizations?select=id,name,region_name,district_name,jamoat_name,village_name,school_code,parent_id,verification_status&kind=eq.school&order=name.asc`,
          { method: 'GET', headers: serviceHeaders(serviceKey) },
        ),
        sbFetch(
          `${supabaseUrl}/rest/v1/organizations?select=id,name,authority_tier,region_name,district_name,parent_id&kind=eq.education_authority&order=region_name.asc,district_name.asc`,
          { method: 'GET', headers: serviceHeaders(serviceKey) },
        ),
        sbFetch(
          `${supabaseUrl}/rest/v1/role_tariffs?select=position_code,group_code,access_role,title_tg,title_ru,base_price_tjs,extra_price_tjs,duration_days,sort_order&group_code=eq.school&is_active=eq.true&order=sort_order.asc`,
          { method: 'GET', headers: serviceHeaders(serviceKey) },
        ),
        sbFetch(
          `${supabaseUrl}/rest/v1/tajikistan_locations?select=id,region_name,district_name,jamoat_name,village_name&order=region_name.asc,district_name.asc&limit=5000`,
          { method: 'GET', headers: serviceHeaders(serviceKey) },
        ),
      ]);
      if (!schRes.ok) return json(500, { error: schRes.errMsg || 'bootstrap_schools_failed' });
      if (!authRes.ok) return json(500, { error: authRes.errMsg || 'bootstrap_authorities_failed' });
      if (!tarRes.ok) return json(500, { error: tarRes.errMsg || 'bootstrap_tariffs_failed' });
      if (!locRes.ok) return json(500, { error: locRes.errMsg || 'bootstrap_locations_failed' });
      return json(200, {
        schools: Array.isArray(schRes.data) ? schRes.data : [],
        authorities: Array.isArray(authRes.data) ? authRes.data : [],
        tariffs: Array.isArray(tarRes.data) ? tarRes.data : [],
        locations: Array.isArray(locRes.data) ? locRes.data : [],
        aliya_price_tjs: 30,
      });
    }

    if (action !== 'register') {
      return json(400, { error: 'unsupported_action' });
    }

    const loginParsed = normalizeLogin(typeof body.login === 'string' ? body.login : '');
    const password = typeof body.password === 'string' ? body.password : '';
    let orgId = typeof body.organization_id === 'string' ? body.organization_id.trim() : '';
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

    let createdSchoolId = '';
    let resolvedSchool: Record<string, unknown> | null = null;

    if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
      if (!newSchoolRaw) return json(400, { error: 'invalid_school' });
      const schoolName = typeof newSchoolRaw.name === 'string' ? newSchoolRaw.name.trim().slice(0, 160) : '';
      let regionName = typeof newSchoolRaw.region_name === 'string' ? newSchoolRaw.region_name.trim().slice(0, 120) : '';
      let districtName = typeof newSchoolRaw.district_name === 'string' ? newSchoolRaw.district_name.trim().slice(0, 120) : '';
      const jamoatName = typeof newSchoolRaw.jamoat_name === 'string' ? newSchoolRaw.jamoat_name.trim().slice(0, 120) : '';
      const villageName = typeof newSchoolRaw.village_name === 'string' ? newSchoolRaw.village_name.trim().slice(0, 120) : '';
      const schoolCode = typeof newSchoolRaw.school_code === 'string' ? newSchoolRaw.school_code.trim().slice(0, 40) : '';
      let parentId = typeof newSchoolRaw.parent_id === 'string' && /^[0-9a-f-]{36}$/i.test(newSchoolRaw.parent_id.trim())
        ? newSchoolRaw.parent_id.trim()
        : '';

      if (schoolName.length < 2) return json(400, { error: 'school_name_required' });

      if (parentId) {
        const pRes = await sbFetch(
          `${supabaseUrl}/rest/v1/organizations?select=id,region_name,district_name,authority_tier&id=eq.${encodeURIComponent(parentId)}&kind=eq.education_authority&limit=1`,
          { method: 'GET', headers: serviceHeaders(serviceKey) },
        );
        const parentAuth = Array.isArray(pRes.data) ? (pRes.data[0] as Record<string, string> | undefined) : undefined;
        if (!parentAuth) return json(400, { error: 'invalid_parent_authority' });
        if (!regionName && parentAuth.region_name) regionName = parentAuth.region_name;
        if (!districtName && parentAuth.district_name) districtName = parentAuth.district_name;
      } else if (districtName) {
        const aRes = await sbFetch(
          `${supabaseUrl}/rest/v1/organizations?select=id,region_name,district_name&kind=eq.education_authority&authority_tier=eq.maorif`,
          { method: 'GET', headers: serviceHeaders(serviceKey) },
        );
        const authList = Array.isArray(aRes.data) ? (aRes.data as Array<Record<string, string>>) : [];
        const targetDist = normDistrict(districtName);
        const targetReg = canonRegion(regionName);
        const matchedAuth = authList.find(a => {
          const aDist = normDistrict(a.district_name);
          const aReg = canonRegion(a.region_name);
          const distHit = aDist === targetDist || (targetDist.length >= 3 && (aDist.includes(targetDist) || targetDist.includes(aDist)));
          return distHit && (!targetReg || !aReg || aReg === targetReg);
        });
        if (matchedAuth) {
          parentId = matchedAuth.id;
          if (!regionName && matchedAuth.region_name) regionName = matchedAuth.region_name;
        }
      }

      if (!regionName || !districtName) {
        return json(400, { error: 'region_and_district_required' });
      }

      let matchUrl = `${supabaseUrl}/rest/v1/organizations?select=id,name,region_name,district_name,jamoat_name,village_name,school_code,parent_id,verification_status&kind=eq.school&district_name=eq.${encodeURIComponent(districtName)}&name=ilike.${encodeURIComponent(schoolName)}&limit=1`;
      if (villageName) matchUrl += `&village_name=eq.${encodeURIComponent(villageName)}`;
      const existingRes = await sbFetch(matchUrl, { method: 'GET', headers: serviceHeaders(serviceKey) });
      const existingMatch = Array.isArray(existingRes.data) ? (existingRes.data[0] as Record<string, unknown> | undefined) : undefined;

      if (existingMatch && typeof existingMatch.id === 'string') {
        orgId = existingMatch.id;
        resolvedSchool = existingMatch;
      } else {
        const insRes = await sbFetch(`${supabaseUrl}/rest/v1/organizations?select=id,name,region_name,district_name,jamoat_name,village_name,school_code,parent_id,verification_status`, {
          method: 'POST',
          headers: serviceHeaders(serviceKey, { Prefer: 'return=representation' }),
          body: JSON.stringify({
            kind: 'school',
            name: schoolName,
            region_name: regionName,
            district_name: districtName,
            jamoat_name: jamoatName || null,
            village_name: villageName || null,
            school_code: schoolCode || null,
            parent_id: parentId || null,
            verification_status: 'pending',
          }),
        });
        const insertedSchool = Array.isArray(insRes.data) ? (insRes.data[0] as Record<string, unknown> | undefined) : undefined;
        if (!insRes.ok || !insertedSchool || typeof insertedSchool.id !== 'string') {
          return json(400, { error: insRes.errMsg || 'school_create_failed' });
        }
        orgId = insertedSchool.id;
        createdSchoolId = insertedSchool.id;
        resolvedSchool = insertedSchool;
      }
    }

    const rollbackCreated = async (uid = '') => {
      if (uid) {
        try {
          await sbFetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
            method: 'DELETE',
            headers: serviceHeaders(serviceKey),
          });
        } catch {}
      }
      if (createdSchoolId) {
        try {
          await sbFetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(createdSchoolId)}`, {
            method: 'DELETE',
            headers: serviceHeaders(serviceKey),
          });
        } catch {}
      }
    };

    if (!resolvedSchool) {
      const orgRes = await sbFetch(
        `${supabaseUrl}/rest/v1/organizations?select=id,name,kind,region_name,district_name,jamoat_name,village_name,school_code,parent_id,verification_status&id=eq.${encodeURIComponent(orgId)}&kind=eq.school&limit=1`,
        { method: 'GET', headers: serviceHeaders(serviceKey) },
      );
      const orgRow = Array.isArray(orgRes.data) ? (orgRes.data[0] as Record<string, unknown> | undefined) : undefined;
      if (!orgRow) return json(404, { error: 'school_not_found' });
      resolvedSchool = orgRow;
    }

    const posRes = await sbFetch(
      `${supabaseUrl}/rest/v1/role_tariffs?select=position_code,access_role,default_max_devices,is_active&position_code=eq.${encodeURIComponent(primaryPosition)}&is_active=eq.true&limit=1`,
      { method: 'GET', headers: serviceHeaders(serviceKey) },
    );
    const posRow = Array.isArray(posRes.data) ? (posRes.data[0] as Record<string, unknown> | undefined) : undefined;
    if (!posRow) {
      await rollbackCreated();
      return json(400, { error: 'position_unavailable' });
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
      await rollbackCreated();
      const msg = createUserRes.errMsg || 'create_user_failed';
      const status = createUserRes.status === 422 || /already|exists|registered/i.test(msg) ? 409 : 400;
      return json(status, { error: status === 409 ? 'login_already_exists' : msg });
    }

    const enrichedDetails = {
      ...profileDetails,
      requested_aliya: includeAliya,
      self_registered_school: Boolean(createdSchoolId),
    };

    const profRes = await sbFetch(`${supabaseUrl}/rest/v1/user_profiles?on_conflict=user_id`, {
      method: 'POST',
      headers: serviceHeaders(serviceKey, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        user_id: userId,
        full_name: fullName,
        preferred_lang: preferredLang,
        login_name: loginParsed.display,
        profile_details: enrichedDetails,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!profRes.ok) {
      await rollbackCreated(userId);
      return json(500, { error: profRes.errMsg || 'profile_save_failed' });
    }

    const trialExpiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const memRes = await sbFetch(`${supabaseUrl}/rest/v1/school_memberships`, {
      method: 'POST',
      headers: serviceHeaders(serviceKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: userId,
        organization_id: orgId,
        role: posRow.access_role,
        primary_position: primaryPosition,
        extra_positions: extraPositions,
        max_extra_positions: extraPositions.length,
        max_devices: Number(posRow.default_max_devices ?? 1) || 1,
        account_active: true,
        aliya_enabled: false,
        custom_method_name: customMethodName,
        position_profiles: positionProfiles,
        verification_status: 'unverified',
        subscription_status: 'trial',
        subscription_months: 1,
        subscription_expires_at: trialExpiresAt,
      }),
    });
    if (!memRes.ok) {
      await rollbackCreated(userId);
      return json(500, { error: memRes.errMsg || 'membership_save_failed' });
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
        school: resolvedSchool,
        verification_status: 'unverified',
        subscription_expires_at: trialExpiresAt,
        session: null,
      });
    }

    return json(200, {
      user_id: userId,
      email: loginParsed.email,
      login_name: loginParsed.display,
      school: resolvedSchool,
      verification_status: 'unverified',
      subscription_expires_at: trialExpiresAt,
      session: signObj,
      user: signObj.user ?? null,
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'internal_error' });
  }
});
