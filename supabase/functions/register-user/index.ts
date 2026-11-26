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
  const handle = /^\d{7,15}$/.test(digits) ? digits : text.toLowerCase().replace(/\s+/g, '');
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
      const [{ data: schools, error: schErr }, { data: tariffs, error: tarErr }] = await Promise.all([
        adminClient
          .from('organizations')
          .select('id,name,region_name,district_name,school_code')
          .eq('kind', 'school')
          .order('name'),
        adminClient
          .from('role_tariffs')
          .select('position_code,group_code,access_role,title_tg,title_ru,base_price_tjs,extra_price_tjs,duration_days,sort_order')
          .eq('group_code', 'school')
          .eq('is_active', true)
          .order('sort_order'),
      ]);
      if (schErr) return json(500, { error: schErr.message });
      if (tarErr) return json(500, { error: tarErr.message });
      return json(200, {
        schools: schools ?? [],
        tariffs: tariffs ?? [],
        aliya_price_tjs: 30,
      });
    }

    if (action !== 'register') {
      return json(400, { error: 'unsupported_action' });
    }

    const loginParsed = normalizeLogin(typeof body.login === 'string' ? body.login : '');
    const password = typeof body.password === 'string' ? body.password : '';
    const orgId = typeof body.organization_id === 'string' ? body.organization_id.trim() : '';
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
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) return json(400, { error: 'invalid_school' });
    if (!SCHOOL_POSITIONS.has(primaryPosition)) return json(400, { error: 'invalid_primary_position' });
    if (!fullName) return json(400, { error: 'full_name_required' });
    for (const ex of extraPositions) {
      if (!canCombine(primaryPosition, ex)) {
        return json(400, { error: `incompatible_extra_position:${ex}` });
      }
    }

    const { data: orgRow } = await adminClient
      .from('organizations')
      .select('id,kind')
      .eq('id', orgId)
      .eq('kind', 'school')
      .maybeSingle();
    if (!orgRow) return json(404, { error: 'school_not_found' });

    const { data: posRow } = await adminClient
      .from('role_tariffs')
      .select('position_code,access_role,default_max_devices,is_active')
      .eq('position_code', primaryPosition)
      .eq('is_active', true)
      .maybeSingle();
    if (!posRow) return json(400, { error: 'position_unavailable' });

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
      const msg = String(createErr?.message || 'create_user_failed');
      const status = /already|exists|registered/i.test(msg) ? 409 : 400;
      return json(status, { error: status === 409 ? 'login_already_exists' : msg });
    }

    const userId = created.user.id;
    const enrichedDetails = {
      ...profileDetails,
      requested_aliya: includeAliya,
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
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      return json(500, { error: profErr.message });
    }

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
    });
    if (memErr) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
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
        session: null,
      });
    }

    return json(200, {
      user_id: userId,
      email: loginParsed.email,
      login_name: loginParsed.display,
      session: signData.session,
      user: signData.user,
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'internal_error' });
  }
});
