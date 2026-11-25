export const DEFAULT_CLOUD_CONFIG = Object.freeze({
  projectRef: 'waorfkkavzzpbrsvjjln',
  url: 'https://waorfkkavzzpbrsvjjln.supabase.co',
  // Public publishable key only (safe for client apps; access is enforced by RLS).
  publishableKey: 'sb_publishable_zhMg9NltEYFlGV84PR8sag_pmiaDkIb',
});

const STORAGE_KEY = 'sm:cloud-config-override';

export function getCloudConfig(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.url && parsed?.publishableKey && /^https:\/\//.test(parsed.url)) {
        return { projectRef: parsed.projectRef || DEFAULT_CLOUD_CONFIG.projectRef, url: parsed.url.replace(/\/+$/, ''), publishableKey: parsed.publishableKey };
      }
    }
  } catch {}
  return { ...DEFAULT_CLOUD_CONFIG };
}

export function setCloudConfigOverride(config, storage = globalThis.localStorage) {
  if (!config) {
    storage?.removeItem?.(STORAGE_KEY);
    return;
  }
  const url = String(config.url || '').trim().replace(/\/+$/, '');
  const publishableKey = String(config.publishableKey || '').trim();
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(url) || !/^sb_publishable_[\w-]+$/.test(publishableKey)) {
    throw new Error('Invalid public Supabase configuration');
  }
  storage?.setItem?.(STORAGE_KEY, JSON.stringify({ url, publishableKey, projectRef: config.projectRef || '' }));
}
