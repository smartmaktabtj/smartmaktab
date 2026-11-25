import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateLicenseState,
  cacheVerifiedLicense,
  readCachedLicense,
} from '../shared/license-guard.mjs';
import {
  hashReceiptBytes,
  parseReceiptText,
  submitReceiptForVerification,
} from '../shared/ocr-receipt.mjs';
import {
  saveBookOffline,
  getCachedBook,
  listCachedBooks,
  deleteCachedBook,
} from '../shared/book-cache.mjs';
import { createCloudClient } from '../shared/cloud-client.mjs';

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
}

test('30-day offline grace license guard evaluates active, grace window, expiry, suspension, and clock tampering', () => {
  const day = 86_400_000;
  const start = Date.UTC(2026, 10, 1, 0, 0, 0);
  const expires = new Date(start + 10 * day).toISOString();

  assert.equal(evaluateLicenseState(null, start).allowed, true);
  assert.equal(evaluateLicenseState(null, start).status, 'unconfigured');

  const active = evaluateLicenseState({ configured: true, status: 'active', expires_at: expires, grace_days: 30 }, start + 2 * day);
  assert.equal(active.status, 'active');
  assert.equal(active.allowed, true);
  assert.equal(active.daysLeft, 8);

  const graceDay1 = evaluateLicenseState({ configured: true, status: 'active', expires_at: expires, grace_days: 30 }, start + 11 * day);
  assert.equal(graceDay1.status, 'grace');
  assert.equal(graceDay1.allowed, true);
  assert.equal(graceDay1.graceDaysLeft, 29);

  const graceDay30 = evaluateLicenseState({ configured: true, status: 'active', expires_at: expires, grace_days: 30 }, start + 40 * day);
  assert.equal(graceDay30.status, 'grace');
  assert.equal(graceDay30.allowed, true);

  const lockedDay31 = evaluateLicenseState({ configured: true, status: 'active', expires_at: expires, grace_days: 30 }, start + 40 * day + 60_000);
  assert.equal(lockedDay31.status, 'locked');
  assert.equal(lockedDay31.allowed, false);
  assert.equal(lockedDay31.reason, 'grace_expired');

  const suspended = evaluateLicenseState({ configured: true, status: 'suspended', expires_at: expires, grace_days: 30 }, start + day);
  assert.equal(suspended.allowed, false);
  assert.equal(suspended.reason, 'suspended');

  const storage = makeMemoryStorage();
  cacheVerifiedLicense('org-1', { configured: true, status: 'active', expires_at: expires, grace_days: 30, server_now: new Date(start + 5 * day).toISOString() }, storage, start + 5 * day);
  const stored = readCachedLicense('org-1', storage, start + 5 * day);
  const tampered = evaluateLicenseState(stored, start + 1 * day);
  assert.equal(tampered.allowed, false);
  assert.equal(tampered.clockTampered, true);
  assert.equal(tampered.reason, 'clock_tampered');
});

test('receipt parser, SHA-256 hash, and Edge Function submission format correctly', async () => {
  const bytes = new TextEncoder().encode('fake-receipt-image-payload');
  const h1 = await hashReceiptBytes(bytes);
  const h2 = await hashReceiptBytes(bytes);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);

  const parsed = parseReceiptText('Пардохт бомуваффақият: 150.50 сомонӣ Сана: 25.11.2026 Чек № TRX998877 Корт **** 4321');
  assert.equal(parsed.detectedAmount, 150.5);
  assert.equal(parsed.detectedDate, '25.11.2026');
  assert.equal(parsed.detectedReference, 'TRX998877');
  assert.equal(parsed.cardLast4, '4321');

  let called = null;
  const result = await submitReceiptForVerification({
    accessToken: 'jwt-test',
    organizationId: '11111111-1111-1111-1111-111111111111',
    bytes,
    ocrText: parsed.normalized,
    fetchImpl: async (url, init) => {
      called = { url, init };
      return new Response(JSON.stringify({ submission_id: 'sub-1', ocr_source: 'client_tesseract' }), { status: 200 });
    },
  });
  assert.equal(result.submission_id, 'sub-1');
  assert.ok(called.url.endsWith('/functions/v1/verify-payment-receipt'));
  assert.equal(JSON.parse(called.init.body).receipt_hash, h1);
});

test('manual offline book cache saves, reads, lists, and deletes PDFs cleanly', async () => {
  const storage = makeMemoryStorage();
  const url = 'https://raw.githubusercontent.com/sharipovip/books/main/test-book.pdf';
  const pdf = new TextEncoder().encode('%PDF-1.7\nhello');
  await saveBookOffline({ id: url, title: 'Алгебра 7' }, pdf, { cachesApi: null, storage });

  const loaded = await getCachedBook(url, { cachesApi: null });
  assert.deepEqual(loaded, pdf);
  assert.equal((await listCachedBooks({ cachesApi: null, storage })).length, 1);

  assert.equal(await deleteCachedBook(url, { cachesApi: null, storage }), true);
  assert.equal(await getCachedBook(url, { cachesApi: null }), null);
  assert.equal((await listCachedBooks({ cachesApi: null, storage })).length, 0);
});

test('cloud client authenticates and invokes RPCs with publishable key only', async () => {
  const requests = [];
  const client = createCloudClient({
    config: { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_demo' },
    fetchImpl: async (url, init) => {
      requests.push({ url, headers: init.headers, body: init.body });
      if (url.endsWith('/auth/v1/token?grant_type=password')) {
        return new Response(JSON.stringify({ access_token: 'tok-123', user: { id: 'u1' } }), { status: 200 });
      }
      if (url.endsWith('/rest/v1/rpc/get_my_workspace_context')) {
        return new Response(JSON.stringify({ is_super_admin: true, memberships: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  await client.signIn('admin@example.tj', 'secret');
  const ctx = await client.getWorkspaceContext();
  assert.equal(ctx.is_super_admin, true);
  assert.equal(requests[1].headers.apikey, 'sb_publishable_demo');
  assert.equal(requests[1].headers.Authorization, 'Bearer tok-123');
});
