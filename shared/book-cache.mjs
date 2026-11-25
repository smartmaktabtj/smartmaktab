const CACHE_NAME = 'smartmaktab-books-v1';
const META_KEY = 'sm:offline-books-meta-v1';
const memoryCache = new Map();

function cacheRequestUrl(bookId) {
  return `https://offline-books.smartmaktab.local/${encodeURIComponent(bookId)}.pdf`;
}

function readMeta(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(META_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function writeMeta(meta, storage = globalThis.localStorage) {
  try { storage?.setItem?.(META_KEY, JSON.stringify(meta)); } catch {}
}

export async function saveBookOffline(book, bytes, { cachesApi = globalThis.caches, storage = globalThis.localStorage } = {}) {
  if (!book?.id) throw new Error('Missing book id');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const reqUrl = cacheRequestUrl(book.id);
  if (cachesApi?.open) {
    const cache = await cachesApi.open(CACHE_NAME);
    const res = new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(data.byteLength),
      },
    });
    await cache.put(reqUrl, res);
  } else {
    memoryCache.set(book.id, new Uint8Array(data));
  }
  const meta = readMeta(storage);
  meta[book.id] = {
    id: book.id,
    title: book.title || book.id,
    bytes: data.byteLength,
    savedAt: new Date().toISOString(),
  };
  writeMeta(meta, storage);
  return meta[book.id];
}

export async function getCachedBook(bookId, { cachesApi = globalThis.caches } = {}) {
  if (!bookId) return null;
  if (cachesApi?.open) {
    const cache = await cachesApi.open(CACHE_NAME);
    const match = await cache.match(cacheRequestUrl(bookId));
    if (!match) return null;
    return new Uint8Array(await match.arrayBuffer());
  }
  const mem = memoryCache.get(bookId);
  return mem ? new Uint8Array(mem) : null;
}

export async function deleteCachedBook(bookId, { cachesApi = globalThis.caches, storage = globalThis.localStorage } = {}) {
  if (!bookId) return false;
  let removed = false;
  if (cachesApi?.open) {
    const cache = await cachesApi.open(CACHE_NAME);
    removed = await cache.delete(cacheRequestUrl(bookId));
  } else {
    removed = memoryCache.delete(bookId);
  }
  const meta = readMeta(storage);
  delete meta[bookId];
  writeMeta(meta, storage);
  return removed;
}

export async function listCachedBooks({ cachesApi = globalThis.caches, storage = globalThis.localStorage } = {}) {
  const meta = readMeta(storage);
  if (cachesApi?.open) {
    const cache = await cachesApi.open(CACHE_NAME);
    const keys = await cache.keys();
    const present = new Set(keys.map(r => decodeURIComponent((r.url.split('/').pop() || '').replace(/\.pdf$/, ''))));
    return Object.values(meta).filter(item => present.has(item.id));
  }
  return Object.values(meta).filter(item => memoryCache.has(item.id));
}

export async function estimateStorageSpace(nav = globalThis.navigator) {
  if (!nav?.storage?.estimate) return null;
  try {
    const est = await nav.storage.estimate();
    return {
      usage: est.usage || 0,
      quota: est.quota || 0,
      available: Math.max(0, (est.quota || 0) - (est.usage || 0)),
    };
  } catch {
    return null;
  }
}
