'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadContentModule() {
  const bundled = path.join(__dirname, 'bundled', 'content.cjs');
  if (fs.existsSync(bundled)) return require(bundled);
  return require(path.join(__dirname, '..', 'native', 'windows', 'content.cjs'));
}

function loadRegistry() {
  const bundled = path.join(__dirname, 'bundled', 'cabinet-registry.json');
  const file = fs.existsSync(bundled)
    ? bundled
    : path.join(__dirname, '..', 'shared', 'cabinet-registry.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadCloudDefaults() {
  const bundled = path.join(__dirname, 'bundled', 'cloud-config.json');
  if (fs.existsSync(bundled)) return JSON.parse(fs.readFileSync(bundled, 'utf8'));
  return {
    projectRef: 'waorfkkavzzpbrsvjjln',
    url: 'https://waorfkkavzzpbrsvjjln.supabase.co',
    publishableKey: 'sb_publishable_zhMg9NltEYFlGV84PR8sag_pmiaDkIb',
  };
}

const content = loadContentModule();
const { publicKey, openPack, signPack, getPayload, LIMIT } = content;

const CYR_MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'gh', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', ӣ: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ӯ: 'u', ф: 'f', х: 'kh', ҳ: 'h', ц: 'ts', ч: 'ch',
  ҷ: 'j', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugId(input, fallback = 'item') {
  const raw = String(input || '').trim().toLowerCase();
  let out = '';
  for (const ch of raw) {
    if (CYR_MAP[ch] !== undefined) out += CYR_MAP[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (out && !out.endsWith('-')) out += '-';
  }
  out = out.replace(/^-+|-+$/g, '').slice(0, 56).replace(/-+$/g, '');
  if (!out || !/^[a-z0-9]/.test(out)) return fallback;
  return out;
}

function estimateSignedBytes(jsonBuf) {
  // base64 length + signature (88 chars) + envelope JSON overhead
  const b64Len = Math.ceil(jsonBuf.length / 3) * 4;
  return b64Len + 128;
}

function validatePack(payload, roles) {
  const allowedRoles = Array.isArray(roles) && roles.length ? roles : loadRegistry().map(r => r.id);
  const rawJson = Buffer.from(JSON.stringify(payload));
  const estBytes = estimateSignedBytes(rawJson);
  try {
    getPayload(rawJson, allowedRoles);
  } catch (err) {
    // Produce human-friendly field-level error diagnosis
    let detail = err.code || err.message || 'schema';
    const cats = payload?.cabinets || {};
    for (const [role, list] of Object.entries(cats)) {
      if (!allowedRoles.includes(role)) { detail = `Неизвестная роль: ${role}`; break; }
      if (!Array.isArray(list) || list.length > 20) { detail = `${role}: максимум 20 категорий`; break; }
      const seenCat = new Set();
      for (const c of list) {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(c?.id || '') || seenCat.has(c.id)) {
          detail = `${role}: некорректный или дублирующийся ID категории "${c?.id || ''}"`; break;
        }
        seenCat.add(c.id);
        if (!c?.title?.tg?.trim() || !c?.title?.ru?.trim()) {
          detail = `${role} / ${c.id}: заполните название категории на таджикском и русском`; break;
        }
        if (c.title.tg.length > 80 || c.title.ru.length > 80) {
          detail = `${role} / ${c.id}: название категории длиннее 80 символов`; break;
        }
        if (!['folder', 'document', 'book', 'info'].includes(c.icon)) {
          detail = `${role} / ${c.id}: неизвестная иконка "${c.icon}"`; break;
        }
        if (!Array.isArray(c.sections) || c.sections.length > 20) {
          detail = `${role} / ${c.id}: максимум 20 разделов в категории`; break;
        }
        const seenSec = new Set();
        for (const s of c.sections) {
          if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(s?.id || '') || seenSec.has(s.id)) {
            detail = `${role} / ${c.id}: некорректный или дублирующийся ID раздела "${s?.id || ''}"`; break;
          }
          seenSec.add(s.id);
          if (!s?.title?.tg?.trim() || !s?.title?.ru?.trim()) {
            detail = `${role} / ${c.id} / ${s.id}: заполните заголовок раздела (TJ и RU)`; break;
          }
          if (s.title.tg.length > 100 || s.title.ru.length > 100) {
            detail = `${role} / ${c.id} / ${s.id}: заголовок раздела длиннее 100 символов`; break;
          }
          if (!s?.text?.tg?.trim() || !s?.text?.ru?.trim()) {
            detail = `${role} / ${c.id} / ${s.id}: заполните текст раздела (TJ и RU)`; break;
          }
          if (s.text.tg.length > 4000 || s.text.ru.length > 4000) {
            detail = `${role} / ${c.id} / ${s.id}: текст раздела превышает 4000 символов`; break;
          }
        }
      }
    }
    return {
      ok: false,
      code: err.code || 'schema',
      error: detail,
      jsonBytes: rawJson.length,
      estSmupdateBytes: estBytes,
      limitBytes: LIMIT,
    };
  }
  if (estBytes > LIMIT) {
    return {
      ok: false,
      code: 'size',
      error: `Размер подписанного .smupdate (${estBytes} Б) превышает лимит 262 144 Б (256 КБ)`,
      jsonBytes: rawJson.length,
      estSmupdateBytes: estBytes,
      limitBytes: LIMIT,
    };
  }
  return {
    ok: true,
    jsonBytes: rawJson.length,
    estSmupdateBytes: estBytes,
    limitBytes: LIMIT,
    remainingBytes: LIMIT - estBytes,
  };
}

function generateEd25519Keypair() {
  const { privateKey, publicKey: pub } = crypto.generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicBase64: pub.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

function publicBase64FromPrivatePem(privatePem) {
  const priv = crypto.createPrivateKey(privatePem);
  if (priv.asymmetricKeyType !== 'ed25519') throw Object.assign(new Error('key'), { code: 'key' });
  const pub = crypto.createPublicKey(priv);
  return pub.export({ type: 'spki', format: 'der' }).toString('base64');
}

function signPackWithPem(payload, privatePem, roles) {
  const allowedRoles = Array.isArray(roles) && roles.length ? roles : loadRegistry().map(r => r.id);
  const priv = crypto.createPrivateKey(privatePem);
  const raw = Buffer.from(JSON.stringify(payload));
  const buf = signPack(raw, priv, allowedRoles);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return { buffer: buf, bytes: buf.length, sha256 };
}

function verifyAndOpenSmupdate(buffer, publicBase64, privatePem, roles) {
  const allowedRoles = Array.isArray(roles) && roles.length ? roles : loadRegistry().map(r => r.id);
  let pubKeyBase64 = (publicBase64 || '').trim();
  if (!pubKeyBase64 && privatePem) pubKeyBase64 = publicBase64FromPrivatePem(privatePem);
  if (!pubKeyBase64) throw Object.assign(new Error('Укажите публичный или приватный ключ Ed25519 для проверки подписи'), { code: 'no-key' });
  const key = publicKey(pubKeyBase64);
  return openPack(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), key, allowedRoles);
}

async function publishReleaseToGithub(opts, fetcher = fetch) {
  const { token, ownerRepo, tag, name, notes, fileName, buffer, branchFeedPath, branch = 'main' } = opts;
  if (!token || !ownerRepo || !tag || !fileName || !buffer) {
    throw new Error('Требуются token, ownerRepo, tag, fileName и buffer');
  }
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(ownerRepo)) {
    throw new Error('Некорректный формат репозитория (ожидается owner/repo)');
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'User-Agent': 'SmartMaktab-Admin-Desktop',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1) Find or create GitHub Release for tag
  let release = null;
  const byTag = await fetcher(`https://api.github.com/repos/${ownerRepo}/releases/tags/${encodeURIComponent(tag)}`, { headers });
  if (byTag.ok) {
    release = await byTag.json();
  } else if (byTag.status === 404) {
    const createRes = await fetcher(`https://api.github.com/repos/${ownerRepo}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: branch,
        name: name || tag,
        body: notes || `SmartMaktab content pack ${tag}`,
        draft: false,
        prerelease: false,
      }),
    });
    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(`GitHub Release create HTTP ${createRes.status}: ${errBody}`);
    }
    release = await createRes.json();
  } else {
    throw new Error(`GitHub Release lookup HTTP ${byTag.status}`);
  }

  // Delete matching asset name if re-publishing same tag
  const existingAsset = (release.assets || []).find(a => a.name === fileName);
  if (existingAsset) {
    await fetcher(`https://api.github.com/repos/${ownerRepo}/releases/assets/${existingAsset.id}`, {
      method: 'DELETE',
      headers,
    });
  }

  const uploadBase = String(release.upload_url || '').replace(/\{[^}]+\}$/, '');
  const upRes = await fetcher(`${uploadBase}?name=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });
  if (!upRes.ok) {
    const errText = await upRes.text();
    throw new Error(`GitHub asset upload HTTP ${upRes.status}: ${errText}`);
  }
  const uploadedAsset = await upRes.json();

  let rawFeedUrl = '';
  const cleanFeed = String(branchFeedPath || '').trim().replace(/^\/+/, '');
  if (cleanFeed) {
    if (!cleanFeed.endsWith('.smupdate')) throw new Error('Путь feed должен заканчиваться на .smupdate');
    const getCur = await fetcher(`https://api.github.com/repos/${ownerRepo}/contents/${cleanFeed}?ref=${encodeURIComponent(branch)}`, { headers });
    let sha;
    if (getCur.ok) {
      const curJson = await getCur.json();
      sha = curJson.sha;
    }
    const putRes = await fetcher(`https://api.github.com/repos/${ownerRepo}/contents/${cleanFeed}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(content): publish ${fileName} (${tag})`,
        content: Buffer.from(buffer).toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`GitHub feed update HTTP ${putRes.status}: ${errText}`);
    }
    rawFeedUrl = `https://raw.githubusercontent.com/${ownerRepo}/${branch}/${cleanFeed}`;
  }

  return {
    releaseUrl: release.html_url,
    assetUrl: uploadedAsset.browser_download_url,
    rawFeedUrl,
    tag: release.tag_name,
  };
}

module.exports = {
  LIMIT,
  loadRegistry,
  loadCloudDefaults,
  slugId,
  estimateSignedBytes,
  validatePack,
  generateEd25519Keypair,
  publicBase64FromPrivatePem,
  signPackWithPem,
  verifyAndOpenSmupdate,
  publishReleaseToGithub,
};
