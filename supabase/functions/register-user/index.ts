import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json(500, { error: 'missing_supabase_env' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    }
    const action = req.method === 'GET'
      ? 'bootstrap'
      : (typeof body.action === 'string' ? body.action.trim() : 'register');

    if (action === 'bootstrap' || action === 'list_schools') {
      const [
        { data: schools, error: schErr },
        { data: authorities, error: authErr },
        { data: tariffs, error: tarErr },
        { data: locations, error: locErr },
      ] = await Promise.all([
        adminClient
          .from('organizations')
          .select('id,name,region_name,district_name,jamoat_name,village_name,school_code,parent_id,verification_status')
          .eq('kind', 'school')
          .order('name'),
        adminClient
          .from('organizations')
          .select('id,name,authority_tier,region_name,district_name,parent_id')
          .eq('kind', 'education_authority')
          .order('region_name')
          .order('district_name'),
        adminClient
          .from('role_tariffs')
          .select('position_code,group_code,access_role,title_tg,title_ru,base_price_tjs,extra_price_tjs,duration_days,sort_order')
          .eq('group_code', 'school')
          .eq('is_active', true)
          .order('sort_order'),
        adminClient
          .from('tajikistan_locations')
          .select('id,region_name,district_name,jamoat_name,village_name')
          .order('region_name')
          .order('district_name')
          .range(0, 4999),
      ]);
      if (schErr) return json(500, { error: schErr.message });
      if (authErr) return json(500, { error: authErr.message });
      if (tarErr) return json(500, { error: tarErr.message });
      if (locErr) return json(500, { error: locErr.message });
      return json(200, {
        schools: schools ?? [],
        authorities: authorities ?? [],
        tariffs: tariffs ?? [],
        locations: locations ?? [],
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
        const { data: parentAuth } = await adminClient
          .from('organizations')
          .select('id,region_name,district_name,authority_tier')
          .eq('id', parentId)
          .eq('kind', 'education_authority')
          .maybeSingle();
        if (!parentAuth) return json(400, { error: 'invalid_parent_authority' });
        if (!regionName && parentAuth.region_name) regionName = parentAuth.region_name;
        if (!districtName && parentAuth.district_name) districtName = parentAuth.district_name;
      } else if (districtName) {
        let { data: matchedAuth } = await adminClient
          .from('organizations')
          .select('id,region_name,district_name')
          .eq('kind', 'education_authority')
          .eq('authority_tier', 'maorif')
          .eq('district_name', districtName)
          .limit(1)
          .maybeSingle();
        if (!matchedAuth) {
          const fallback = await adminClient
            .from('organizations')
            .select('id,region_name,district_name')
            .eq('kind', 'education_authority')
            .eq('authority_tier', 'maorif')
            .ilike('district_name', `%${districtName}%`)
            .limit(1)
            .maybeSingle();
          matchedAuth = fallback.data ?? null;
        }
        if (matchedAuth) {
          parentId = matchedAuth.id;
          if (!regionName && matchedAuth.region_name) regionName = matchedAuth.region_name;
        }
      }

      if (!regionName || !districtName) {
        return json(400, { error: 'region_and_district_required' });
      }

      let matchQuery = adminClient
        .from('organizations')
        .select('id,name,region_name,district_name,jamoat_name,village_name,school_code,parent_id,verification_status')
        .eq('kind', 'school')
        .eq('district_name', districtName)
        .ilike('name', schoolName);
      if (villageName) matchQuery = matchQuery.eq('village_name', villageName);
      const { data: existingMatch } = await matchQuery.limit(1).maybeSingle();

      if (existingMatch) {
        orgId = existingMatch.id;
        resolvedSchool = existingMatch;
      } else {
        const { data: insertedSchool, error: insErr } = await adminClient
          .from('organizations')
          .insert({
            kind: 'school',
            name: schoolName,
            region_name: regionName,
            district_name: districtName,
            jamoat_name: jamoatName || null,
            village_name: villageName || null,
            school_code: schoolCode || null,
            parent_id: parentId || null,
            verification_status: 'pending',
          })
          .select('id,name,region_name,district_name,jamoat_name,village_name,school_code,parent_id,verification_status')
          .single();
        if (insErr || !insertedSchool) {
          return json(400, { error: insErr?.message || 'school_create_failed' });
        }
        orgId = insertedSchool.id;
        createdSchoolId = insertedSchool.id;
        resolvedSchool = insertedSchool;
      }
    }

    const rollbackCreated = async (uid = '') => {
      if (uid) {
        try { await adminClient.auth.admin.deleteUser(uid); } catch {}
      }
      if (createdSchoolId) {
        try { await adminClient.from('organizations').delete().eq('id', createdSchoolId); } catch {}
      }
    };

    if (!resolvedSchool) {
      const { data: orgRow } = await adminClient
        .from('organizations')
        .select('id,name,kind,region_name,district_name,school_code,parent_id')
        .eq('id', orgId)
        .eq('kind', 'school')
        .maybeSingle();
      if (!orgRow) return json(404, { error: 'school_not_found' });
      resolvedSchool = orgRow;
    }

    const { data: posRow } = await adminClient
      .from('role_tariffs')
      .select('position_code,access_role,default_max_devices,is_active')
      .eq('position_code', primaryPosition)
      .eq('is_active', true)
      .maybeSingle();
    if (!posRow) {
      await rollbackCreated();
      return json(400, { error: 'position_unavailable' });
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: loginParsed.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        login_name: loginParsed.display,
      },
    });
    if (createErr || !created?.user) {
      await rollbackCreated();
      const msg = String(createErr?.message || 'create_user_failed');
      const status = /already|exists|registered/i.test(msg) ? 409 : 400;
      return json(status, { error: status === 409 ? 'login_already_exists' : msg });
    }

    const userId = created.user.id;
    const enrichedDetails = {
      ...profileDetails,
      requested_aliya: includeAliya,
      self_registered_school: Boolean(createdSchoolId),
    };

    const { error: profErr } = await adminClient.from('user_profiles').upsert(
      {
        user_id: userId,
        full_name: fullName,
        preferred_lang: preferredLang,
        login_name: loginParsed.display,
        profile_details: enrichedDetails,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (profErr) {
      await rollbackCreated(userId);
      return json(500, { error: profErr.message });
    }

    const trialExpiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const { error: memErr } = await adminClient.from('school_memberships').insert({
      user_id: userId,
      organization_id: orgId,
      role: posRow.access_role,
      primary_position: primaryPosition,
      extra_positions: extraPositions,
      max_extra_positions: extraPositions.length,
      max_devices: posRow.default_max_devices ?? 1,
      account_active: true,
      aliya_enabled: false,
      custom_method_name: customMethodName,
      position_profiles: positionProfiles,
      verification_status: 'unverified',
      subscription_status: 'trial',
      subscription_months: 1,
      subscription_expires_at: trialExpiresAt,
    });
    if (memErr) {
      await rollbackCreated(userId);
      return json(500, { error: memErr.message });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signData, error: signErr } = await anonClient.auth.signInWithPassword({
      email: loginParsed.email,
      password,
    });
    if (signErr || !signData?.session) {
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
      session: signData.session,
      user: signData.user,
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'internal_error' });
  }
});
