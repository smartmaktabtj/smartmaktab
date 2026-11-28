import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function isSafeStoragePath(path: string): boolean {
  return Boolean(path) && !path.includes('..') && !path.startsWith('/') && path.length <= 400;
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
    if (ctxError || !ctx?.user_id) {
      return json(401, { error: ctxError?.message || 'unauthorized' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userId = String(ctx.user_id);
    const isSuperAdmin = ctx.is_super_admin === true;
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action.trim() : '';

    if (action === 'save_draft') {
      const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : '';
      const rawFolderId = typeof body?.folder_id === 'string' ? body.folder_id.trim() : '';
      const folderId = rawFolderId ? rawFolderId : null;
      const customTitle = typeof body?.custom_title === 'string' ? body.custom_title.trim().slice(0, 180) : '';
      const gzipB64 = typeof body?.gzip_b64 === 'string' ? body.gzip_b64.trim() : '';
      const sizeBytes = Math.max(0, Number(body?.size_bytes) || 0);

      if (!UUID_RE.test(templateId) || (folderId && !UUID_RE.test(folderId))) {
        return json(400, { error: 'invalid_ids' });
      }
      if (!gzipB64 || gzipB64.length > 700000) {
        return json(400, { error: 'invalid_or_oversized_payload' });
      }
      const { data: tplCheck } = await adminClient
        .from('document_templates')
        .select('id, doc_format')
        .eq('id', templateId)
        .maybeSingle();
      if (!tplCheck) {
        return json(404, { error: 'template_not_found' });
      }
      if (tplCheck.doc_format === 'pdf') {
        return json(400, { error: 'pdf_readonly_cannot_save_draft' });
      }

      // Verify ownership and quota before uploading to private bucket
      let existingHasDraft = false;
      const itemQuery = adminClient
        .from('user_document_items')
        .select('id, has_draft')
        .eq('user_id', userId)
        .eq('template_id', templateId);
      const { data: existingItem } = folderId
        ? await itemQuery.eq('folder_id', folderId).maybeSingle()
        : await itemQuery.is('folder_id', null).maybeSingle();
      if (existingItem?.has_draft) {
        existingHasDraft = true;
      }

      const quota = (ctx.document_quota ?? {}) as { drafts_used?: number; drafts_limit?: number };
      if (!existingHasDraft && Number(quota.drafts_used ?? 0) >= Number(quota.drafts_limit ?? 50)) {
        return json(403, { error: 'draft_quota_exceeded', quota });
      }

      const bytes = b64ToBytes(gzipB64);
      if (bytes.byteLength > 524288) {
        return json(400, { error: 'draft_exceeds_512kb_compressed' });
      }

      const objectPath = `${userId}/${folderId || 'root'}/${templateId}.gz`;
      const { error: uploadErr } = await adminClient.storage
        .from('doc-drafts-private')
        .upload(objectPath, bytes, {
          contentType: 'application/gzip',
          upsert: true,
        });
      if (uploadErr) {
        return json(500, { error: uploadErr.message });
      }

      const { data: rpcRes, error: rpcErr } = await userClient.rpc('save_user_document_draft', {
        p_template_id: templateId,
        p_folder_id: folderId,
        p_custom_title: customTitle,
        p_draft_storage_path: objectPath,
        p_draft_gzip_b64: '',
        p_size_bytes: sizeBytes || bytes.byteLength,
      });
      if (rpcErr) {
        if (!existingHasDraft) {
          await adminClient.storage.from('doc-drafts-private').remove([objectPath]).catch(() => {});
        }
        return json(rpcErr.message?.includes('quota') ? 403 : 400, { error: rpcErr.message });
      }

      return json(200, {
        ok: true,
        storage_path: objectPath,
        item: rpcRes?.item ?? null,
        quota: rpcRes?.quota ?? ctx.document_quota,
      });
    }

    if (action === 'load_draft') {
      const storagePath = typeof body?.storage_path === 'string' ? body.storage_path.trim() : '';
      if (!isSafeStoragePath(storagePath)) {
        return json(400, { error: 'invalid_storage_path' });
      }
      if (!isSuperAdmin && !storagePath.startsWith(`${userId}/`)) {
        return json(403, { error: 'forbidden' });
      }
      const { data, error } = await adminClient.storage
        .from('doc-drafts-private')
        .download(storagePath);
      if (error || !data) {
        return json(404, { error: error?.message || 'draft_not_found' });
      }
      const buf = new Uint8Array(await data.arrayBuffer());
      return json(200, { ok: true, gzip_b64: bytesToB64(buf) });
    }

    if (action === 'delete_draft') {
      const itemId = typeof body?.item_id === 'string' ? body.item_id.trim() : '';
      const storagePath = typeof body?.storage_path === 'string' ? body.storage_path.trim() : '';
      let rpcRes: Record<string, unknown> = {};
      if (UUID_RE.test(itemId)) {
        const { data, error } = await userClient.rpc('reset_user_document_draft', { p_item_id: itemId });
        if (error) return json(400, { error: error.message });
        rpcRes = (data ?? {}) as Record<string, unknown>;
      }
      if (isSafeStoragePath(storagePath) && (isSuperAdmin || storagePath.startsWith(`${userId}/`))) {
        await adminClient.storage.from('doc-drafts-private').remove([storagePath]).catch(() => {});
      }
      return json(200, { ok: true, ...rpcRes });
    }

    if (action === 'save_template_blob') {
      if (!isSuperAdmin) {
        return json(403, { error: 'super_admin_required' });
      }
      const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : '';
      const version = Math.max(1, Number(body?.version) || 1);
      const gzipB64 = typeof body?.gzip_b64 === 'string' ? body.gzip_b64.trim() : '';
      if (!UUID_RE.test(templateId) || !gzipB64) {
        return json(400, { error: 'invalid_template_blob' });
      }
      const bytes = b64ToBytes(gzipB64);
      if (bytes.byteLength > 5242880) {
        return json(400, { error: 'template_exceeds_5mb' });
      }
      const objectPath = `templates/${templateId}/v${version}.gz`;
      const { error } = await adminClient.storage
        .from('doc-templates-private')
        .upload(objectPath, bytes, { contentType: 'application/gzip', upsert: true });
      if (error) {
        return json(500, { error: error.message });
      }
      return json(200, { ok: true, storage_path: objectPath, size_bytes: bytes.byteLength });
    }

    if (action === 'load_template_blob') {
      const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : '';
      if (!UUID_RE.test(templateId)) {
        return json(400, { error: 'invalid_template_id' });
      }
      const { data: tpl, error: tplErr } = await userClient
        .from('document_templates')
        .select('id, storage_path, status')
        .eq('id', templateId)
        .maybeSingle();
      if (tplErr || !tpl) {
        return json(404, { error: 'template_not_found' });
      }
      const storagePath = typeof body?.storage_path === 'string' && isSafeStoragePath(body.storage_path.trim())
        ? body.storage_path.trim()
        : String(tpl.storage_path || '');
      if (!storagePath || (!isSuperAdmin && !storagePath.startsWith(`templates/${templateId}/`))) {
        return json(404, { error: 'template_blob_not_found' });
      }
      const { data, error } = await adminClient.storage
        .from('doc-templates-private')
        .download(storagePath);
      if (error || !data) {
        return json(404, { error: error?.message || 'template_blob_missing' });
      }
      const buf = new Uint8Array(await data.arrayBuffer());
      return json(200, { ok: true, gzip_b64: bytesToB64(buf) });
    }

    if (action === 'save_template_pdf') {
      if (!isSuperAdmin) {
        return json(403, { error: 'super_admin_required' });
      }
      const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : '';
      const version = Math.max(1, Number(body?.version) || 1);
      const pdfB64 = typeof body?.pdf_b64 === 'string' ? body.pdf_b64.trim() : '';
      if (!UUID_RE.test(templateId) || !pdfB64) {
        return json(400, { error: 'invalid_template_pdf' });
      }
      const bytes = b64ToBytes(pdfB64);
      if (bytes.byteLength < 8 || bytes.byteLength > 15728640) {
        return json(400, { error: 'pdf_exceeds_15mb_or_empty' });
      }
      const isPdfHeader =
        bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (!isPdfHeader) {
        return json(400, { error: 'invalid_pdf_signature' });
      }
      const objectPath = `templates/${templateId}/v${version}.pdf`;
      const { error } = await adminClient.storage
        .from('doc-templates-private')
        .upload(objectPath, bytes, { contentType: 'application/pdf', upsert: true });
      if (error) {
        return json(500, { error: error.message });
      }
      return json(200, { ok: true, pdf_storage_path: objectPath, size_bytes: bytes.byteLength });
    }

    if (action === 'load_template_pdf') {
      const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : '';
      if (!UUID_RE.test(templateId)) {
        return json(400, { error: 'invalid_template_id' });
      }
      const { data: tpl, error: tplErr } = await userClient
        .from('document_templates')
        .select('id, pdf_storage_path, doc_format, status')
        .eq('id', templateId)
        .maybeSingle();
      if (tplErr || !tpl) {
        return json(404, { error: 'template_not_found' });
      }
      const pdfPath = typeof body?.pdf_storage_path === 'string' && isSafeStoragePath(body.pdf_storage_path.trim())
        ? body.pdf_storage_path.trim()
        : String(tpl.pdf_storage_path || '');
      if (!pdfPath || (!isSuperAdmin && !pdfPath.startsWith(`templates/${templateId}/`))) {
        return json(404, { error: 'template_pdf_not_found' });
      }
      const { data, error } = await adminClient.storage
        .from('doc-templates-private')
        .download(pdfPath);
      if (error || !data) {
        return json(404, { error: error?.message || 'template_pdf_missing' });
      }
      const buf = new Uint8Array(await data.arrayBuffer());
      return json(200, { ok: true, pdf_b64: bytesToB64(buf), size_bytes: buf.byteLength });
    }

    if (action === 'delete_template_blob') {
      if (!isSuperAdmin) {
        return json(403, { error: 'super_admin_required' });
      }
      const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : '';
      const storagePath = typeof body?.storage_path === 'string' ? body.storage_path.trim() : '';
      const pdfStoragePath = typeof body?.pdf_storage_path === 'string' ? body.pdf_storage_path.trim() : '';
      const explicitPaths = [storagePath, pdfStoragePath].filter((p) => isSafeStoragePath(p));
      if (explicitPaths.length) {
        await adminClient.storage.from('doc-templates-private').remove(explicitPaths).catch(() => {});
      }
      if (UUID_RE.test(templateId)) {
        const { data: list } = await adminClient.storage
          .from('doc-templates-private')
          .list(`templates/${templateId}`);
        const paths = (list || []).map((f) => `templates/${templateId}/${f.name}`);
        if (paths.length) {
          await adminClient.storage.from('doc-templates-private').remove(paths).catch(() => {});
        }
      }
      return json(200, { ok: true });
    }

    return json(400, { error: 'unknown_action' });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'internal_error' });
  }
});
