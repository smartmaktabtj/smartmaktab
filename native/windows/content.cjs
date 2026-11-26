'use strict';
const { createPublicKey, verify, sign } = require('node:crypto');
const https = require('node:https');

const LIMIT = 256 * 1024;
const DOCX_B64_LIMIT = 240 * 1024;
const stop = code => { throw Object.assign(new Error(code), { code }); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const keys = (x, expected) => object(x) && Object.keys(x).sort().join(',') === expected.split(',').sort().join(',');
const allowedKeys = (x, requiredList, optionalList) => {
  if (!object(x)) return false;
  const actual = Object.keys(x);
  const all = new Set([...requiredList, ...optionalList]);
  return requiredList.every(k => Object.prototype.hasOwnProperty.call(x, k)) && actual.every(k => all.has(k));
};
const id = x => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x);
const string = (x, n) => typeof x === 'string' && x.trim().length > 0 && x.length <= n && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(x);
const bilingual = (x, n) => keys(x, 'ru,tg') && string(x.tg, n) && string(x.ru, n);
const icons = new Set([
  'folder', 'document', 'book', 'info',
  'calendar', 'chart', 'settings', 'users', 'money', 'school',
]);
const roleGroups = new Set(['school', 'maorif', 'raesat']);

function decode(b64) {
  if (typeof b64 !== 'string' || !b64.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) stop('format');
  const data = Buffer.from(b64, 'base64');
  if (data.toString('base64') !== b64) stop('format');
  return data;
}

function publicKey(value) {
  const bytes = decode(value);
  if (bytes.length !== 44) stop('key');
  const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ed25519') stop('key');
  return key;
}

function parseJson(data) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch {
    stop('format');
  }
}

function validateSection(s) {
  if (!allowedKeys(s, ['id', 'title', 'text'], ['docxName', 'docxBase64'])) stop('schema');
  if (!id(s.id) || !bilingual(s.title, 100) || !bilingual(s.text, 4000)) stop('schema');
  const hasName = s.docxName !== undefined;
  const hasData = s.docxBase64 !== undefined;
  if (hasName !== hasData) stop('schema');
  if (hasName) {
    if (typeof s.docxName !== 'string' || !/^[\w .()-]{1,80}\.docx$/i.test(s.docxName.trim())) stop('schema');
    if (typeof s.docxBase64 !== 'string' || !s.docxBase64.length || s.docxBase64.length > DOCX_B64_LIMIT) stop('schema');
    decode(s.docxBase64);
  }
}

function getPayload(data, roles) {
  const p = parseJson(data);
  const validRoles = new Set(roles);
  if (
    !allowedKeys(p, ['schema', 'sequence', 'cabinets'], ['customRoles']) ||
    p.schema !== 1 ||
    !Number.isSafeInteger(p.sequence) ||
    p.sequence < 1 ||
    !object(p.cabinets)
  ) {
    stop('schema');
  }
  if (p.customRoles !== undefined) {
    if (!Array.isArray(p.customRoles) || p.customRoles.length > 30) stop('schema');
    for (const r of p.customRoles) {
      if (!keys(r, 'group,id,title') || !id(r.id) || !bilingual(r.title, 80) || !roleGroups.has(r.group)) stop('schema');
      validRoles.add(r.id);
    }
  }
  for (const [role, cats] of Object.entries(p.cabinets)) {
    if (!validRoles.has(role) || !Array.isArray(cats) || cats.length > 20) stop('schema');
    const catIds = new Set();
    for (const c of cats) {
      if (
        !keys(c, 'id,title,icon,sections') ||
        !id(c.id) ||
        catIds.has(c.id) ||
        !bilingual(c.title, 80) ||
        !icons.has(c.icon) ||
        !Array.isArray(c.sections) ||
        c.sections.length > 20
      ) {
        stop('schema');
      }
      catIds.add(c.id);
      const sectionIds = new Set();
      for (const s of c.sections) {
        validateSection(s);
        if (sectionIds.has(s.id)) stop('schema');
        sectionIds.add(s.id);
      }
    }
  }
  return p;
}

function openPack(data, key, roles) {
  if (data.length > LIMIT) stop('size');
  const outer = parseJson(data);
  if (!keys(outer, 'payload,signature')) stop('format');
  const raw = decode(outer.payload);
  const sig = decode(outer.signature);
  if (sig.length !== 64 || !verify(null, raw, key, sig)) stop('signature');
  return getPayload(raw, roles);
}

function signPack(data, key, roles) {
  if (key.asymmetricKeyType !== 'ed25519') stop('key');
  getPayload(data, roles);
  const out = Buffer.from(JSON.stringify({ payload: data.toString('base64'), signature: sign(null, data, key).toString('base64') }) + '\n');
  if (out.length > LIMIT) stop('size');
  return out;
}

function feed(value) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    stop('feed');
  }
  if (
    url.origin !== 'https://raw.githubusercontent.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[\w.-]+\/[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*\/[\w.-]+\.smupdate$/.test(url.pathname) ||
    url.pathname.split('/').includes('..')
  ) {
    stop('feed');
  }
  return url.href;
}

async function readBounded(file, fs) {
  const f = await fs.open(file, 'r');
  try {
    if (!(await f.stat()).isFile()) stop('format');
    const data = Buffer.alloc(LIMIT + 1);
    let at = 0;
    while (at < data.length) {
      const { bytesRead } = await f.read(data, at, data.length - at, at);
      if (!bytesRead) break;
      at += bytesRead;
    }
    if (at > LIMIT) stop('size');
    return data.subarray(0, at);
  } finally {
    await f.close();
  }
}

function httpsGetBounded(targetUrl) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, { timeout: 10000, headers: { 'Cache-Control': 'no-store' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        reject(Object.assign(new Error('network'), { code: 'network' }));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(Object.assign(new Error('network'), { code: 'network' }));
        return;
      }
      const len = Number(res.headers['content-length']);
      if (Number.isFinite(len) && len > LIMIT) {
        res.destroy();
        reject(Object.assign(new Error('size'), { code: 'size' }));
        return;
      }
      const parts = [];
      let length = 0;
      res.on('data', chunk => {
        length += chunk.length;
        if (length > LIMIT) {
          res.destroy();
          reject(Object.assign(new Error('size'), { code: 'size' }));
          return;
        }
        parts.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(parts, length)));
      res.on('error', () => reject(Object.assign(new Error('network'), { code: 'network' })));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('network'), { code: 'network' })));
    req.on('error', err => reject(err?.code === 'size' ? err : Object.assign(new Error('network'), { code: 'network' })));
  });
}

async function fetchBounded(url, fetcher = globalThis.fetch) {
  const safeUrl = feed(url);
  if (typeof fetcher !== 'function') {
    return httpsGetBounded(safeUrl);
  }
  const response = await fetcher(safeUrl, {
    redirect: 'error',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok || !response.body) stop('network');
  if (Number(response.headers.get('content-length')) > LIMIT) {
    await response.body.cancel();
    stop('size');
  }
  const reader = response.body.getReader();
  const parts = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LIMIT) stop('size');
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts, length);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

module.exports = { publicKey, openPack, signPack, getPayload, feed, readBounded, fetchBounded, LIMIT };
