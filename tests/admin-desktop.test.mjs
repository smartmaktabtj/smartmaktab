import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packCore = require('../admin-desktop/pack-core.cjs');
const { openPack, publicKey } = require('../native/windows/content.cjs');

test('admin-desktop pack-core validates roles, transliterates IDs, generates keys, and signs compatible .smupdate', () => {
  const roles = packCore.loadRegistry().map(r => r.id);
  assert.ok(roles.length >= 50);
  assert.equal(packCore.slugId('Ҳуҷҷатҳои мактабӣ!'), 'hujjathoi-maktabi');
  assert.equal(packCore.slugId('Документы директора 2026'), 'dokumenty-direktora-2026');

  const keys = packCore.generateEd25519Keypair();
  assert.equal(packCore.publicBase64FromPrivatePem(keys.privatePem), keys.publicBase64);

  const sample = {
    schema: 1,
    sequence: 7,
    cabinets: {
      'school-director': [
        {
          id: 'orders',
          title: { tg: 'Фармонҳо', ru: 'Приказы' },
          icon: 'folder',
          sections: [
            {
              id: 'order-1',
              title: { tg: 'Оғози соли таҳсил', ru: 'Начало учебного года' },
              text: { tg: 'Матни пурраи фармон.', ru: 'Полный текст приказа.' },
            },
          ],
        },
      ],
    },
  };

  const check = packCore.validatePack(sample, roles);
  assert.equal(check.ok, true);
  assert.ok(check.estSmupdateBytes < check.limitBytes);

  const signed = packCore.signPackWithPem(sample, keys.privatePem, roles);
  assert.equal(signed.buffer.length <= packCore.LIMIT, true);

  // Must open both via packCore helper and directly via native/windows/content.cjs openPack!
  const openedByStudio = packCore.verifyAndOpenSmupdate(signed.buffer, keys.publicBase64, null, roles);
  const openedByClient = openPack(signed.buffer, publicKey(keys.publicBase64), roles);
  assert.deepEqual(openedByStudio, sample);
  assert.deepEqual(openedByClient, sample);

  // Unknown role or empty bilingual text must return clear validation diagnostics
  const bad = packCore.validatePack({ schema: 1, sequence: 1, cabinets: { 'bad-role': [] } }, roles);
  assert.equal(bad.ok, false);
  assert.ok(bad.error.includes('bad-role'));
});

test('admin-desktop publishReleaseToGithub creates release, uploads asset, and updates branch feed via mock API', async () => {
  const calls = [];
  const mockFetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.endsWith('/releases/tags/content-v2')) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }
    if (url.endsWith('/releases') && init.method === 'POST') {
      return new Response(JSON.stringify({
        id: 1,
        tag_name: 'content-v2',
        html_url: 'https://github.com/smartmaktabtj/smartmaktab/releases/tag/content-v2',
        upload_url: 'https://uploads.github.com/repos/smartmaktabtj/smartmaktab/releases/1/assets{?name,label}',
        assets: [],
      }), { status: 201 });
    }
    if (url.startsWith('https://uploads.github.com/')) {
      return new Response(JSON.stringify({ browser_download_url: 'https://github.com/smartmaktabtj/smartmaktab/releases/download/content-v2/smartmaktab-content-v2.smupdate' }), { status: 201 });
    }
    if (url.includes('/contents/updates/latest.smupdate') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 });
    }
    if (url.includes('/contents/updates/latest.smupdate') && init.method === 'PUT') {
      return new Response(JSON.stringify({ content: { path: 'updates/latest.smupdate' } }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };

  const out = await packCore.publishReleaseToGithub(
    {
      token: 'ghp_testtoken',
      ownerRepo: 'smartmaktabtj/smartmaktab',
      tag: 'content-v2',
      fileName: 'smartmaktab-content-v2.smupdate',
      buffer: Buffer.from('{"payload":"e30=","signature":"AAAA"}'),
      branchFeedPath: 'updates/latest.smupdate',
    },
    mockFetch
  );
  assert.equal(out.tag, 'content-v2');
  assert.equal(out.rawFeedUrl, 'https://raw.githubusercontent.com/smartmaktabtj/smartmaktab/main/updates/latest.smupdate');
  assert.equal(calls.length, 5);
});
