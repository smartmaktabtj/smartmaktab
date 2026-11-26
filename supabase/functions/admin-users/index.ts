import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_ROLES = new Set([
  'school_admin',
  'director',
  'deputy',
  'staff',
  'teacher',
  'authority_viewer',
  'maorif',
]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateReadablePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `SM-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
}

async function listAllAuthUsers(adminClient: ReturnType<typeof createClient>) {
  const collected: Array<{
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    user_metadata?: Record<string, unknown>;
  }> = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const batch = data?.users ?? [];
    for (const u of batch) {
      collected.push({
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at ?? '',
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        user_metadata: (u.user_metadata ?? {}) as Record<string, unknown>,
      });
    }
    if (batch.length < 200) break;
  }
  return collected;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'unauthorized' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json(500, { error: 'missing_supabase_env' });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ctx, error: ctxError } = await userClient.rpc('get_my_workspace_context');
    if (ctxError) {
      return json(401, { error: ctxError.message || 'unauthorized' });
    }
    if (!ctx?.is_super_admin) {
      return json(403, { error: 'super_admin_required' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action.trim() : '';

    if (action === 'list_users') {
      const authUsers = await listAllAuthUsers(adminClient);
      const { data: profiles } = await adminClient
        .from('user_profiles')
        .select('user_id,full_name,preferred_lang');
      const profileMap = new Map<string, { full_name: string; preferred_lang: string }>();
      for (const p of profiles ?? []) {
        profileMap.set(p.user_id, {
          full_name: p.full_name ?? '',
          preferred_lang: p.preferred_lang ?? 'tg',
        });
      }
      const users = authUsers.map((u) => {
        const prof = profileMap.get(u.id);
        const metaName = typeof u.user_metadata?.full_name === 'string' ? u.user_metadata.full_name : '';
        return {
          id: u.id,
          email: u.email,
          full_name: prof?.full_name || metaName || '',
          preferred_lang: prof?.preferred_lang || 'tg',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed: Boolean(u.email_confirmed_at),
        };
      });
      return json(200, { users });
    }

    if (action === 'assign_or_create') {
      const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const rawUserId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
      const orgId = typeof body?.org_id === 'string' ? body.org_id.trim() : '';
      const role = typeof body?.role === 'string' ? body.role.trim() : '';
      const fullName = typeof body?.full_name === 'string' ? body.full_name.trim().slice(0, 160) : '';
      const preferredLang = body?.preferred_lang === 'ru' ? 'ru' : 'tg';
      const customPassword = typeof body?.password === 'string' ? body.password.trim() : '';
      const forceResetPassword = body?.reset_password === true;

      if (!/^[0-9a-f-]{36}$/i.test(orgId) || !VALID_ROLES.has(role)) {
        return json(400, { error: 'invalid_org_or_role' });
      }
      if (!rawEmail && !/^[0-9a-f-]{36}$/i.test(rawUserId)) {
        return json(400, { error: 'email_or_user_id_required' });
      }
      if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return json(400, { error: 'invalid_email' });
      }
      if (customPassword && customPassword.length < 8) {
        return json(400, { error: 'password_too_short' });
      }

      const authUsers = await listAllAuthUsers(adminClient);
      let existing = rawUserId
        ? authUsers.find((u) => u.id === rawUserId)
        : undefined;
      if (!existing && rawEmail) {
        existing = authUsers.find((u) => u.email.toLowerCase() === rawEmail);
      }

      let targetUserId = existing?.id ?? '';
      let targetEmail = existing?.email ?? rawEmail;
      let created = false;
      let temporaryPassword: string | null = null;

      if (!existing) {
        if (!rawEmail) {
          return json(404, { error: 'user_not_found' });
        }
        temporaryPassword = customPassword || generateReadablePassword();
        const { data: createdData, error: createErr } = await adminClient.auth.admin.createUser({
          email: rawEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: fullName ? { full_name: fullName } : undefined,
        });
        if (createErr || !createdData?.user) {
          return json(400, { error: createErr?.message || 'create_user_failed' });
        }
        targetUserId = createdData.user.id;
        targetEmail = createdData.user.email ?? rawEmail;
        created = true;
      } else if (forceResetPassword || customPassword) {
        temporaryPassword = customPassword || generateReadablePassword();
        const { error: updErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
          password: temporaryPassword,
          email_confirm: true,
          ...(fullName ? { user_metadata: { ...(existing.user_metadata ?? {}), full_name: fullName } } : {}),
        });
        if (updErr) {
          return json(400, { error: updErr.message || 'update_password_failed' });
        }
      }

      if (fullName) {
        await adminClient.from('user_profiles').upsert(
          {
            user_id: targetUserId,
            full_name: fullName,
            preferred_lang: preferredLang,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      }

      const { data: membershipId, error: rpcErr } = await userClient.rpc('admin_assign_membership', {
        p_user_id: targetUserId,
        p_org_id: orgId,
        p_role: role,
      });
      if (rpcErr) {
        return json(400, { error: rpcErr.message || 'assign_membership_failed' });
      }

      return json(200, {
        user_id: targetUserId,
        email: targetEmail,
        full_name: fullName,
        membership_id: membershipId,
        organization_id: orgId,
        role,
        created,
        temporary_password: temporaryPassword,
      });
    }

    if (action === 'reset_password') {
      const rawUserId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
      const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const customPassword = typeof body?.password === 'string' ? body.password.trim() : '';
      if (customPassword && customPassword.length < 8) {
        return json(400, { error: 'password_too_short' });
      }
      const authUsers = await listAllAuthUsers(adminClient);
      const target = rawUserId
        ? authUsers.find((u) => u.id === rawUserId)
        : rawEmail
          ? authUsers.find((u) => u.email.toLowerCase() === rawEmail)
          : undefined;
      if (!target) {
        return json(404, { error: 'user_not_found' });
      }
      const nextPassword = customPassword || generateReadablePassword();
      const { error: updErr } = await adminClient.auth.admin.updateUserById(target.id, {
        password: nextPassword,
        email_confirm: true,
      });
      if (updErr) {
        return json(400, { error: updErr.message || 'reset_password_failed' });
      }
      return json(200, {
        user_id: target.id,
        email: target.email,
        temporary_password: nextPassword,
      });
    }

    return json(400, { error: 'unsupported_action' });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'internal_error' });
  }
});
