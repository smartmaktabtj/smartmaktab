const localHosts = new Set(['localhost', '127.0.0.1']);
export function validateConfig(data, browserHostname) {
  const url = new URL(data?.url);
  const key = data?.publishableKey;
  const hosted = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url.origin);
  const local = url.protocol === 'http:' && localHosts.has(url.hostname)
    && url.port === '54321' && localHosts.has(browserHostname);
  const publishable = typeof key === 'string' && /^sb_publishable_[\w-]+$/.test(key);
  // Older local Supabase CLI installations issue a JWT anon key, not a publishable key.
  let localAnon = false;
  if (local && typeof key === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) {
    try { localAnon = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
    catch { /* reject malformed key */ }
  }
  if ((!hosted && !local) || url.pathname !== '/' || url.search || url.hash
    || url.username || url.password || (!publishable && !localAnon)) throw new Error('Invalid dev config');
  return { url: url.origin, key };
}

// Do not enable the experimental write UI on a hosted page or against a cloud project.
export function allowApprovalExperiment(data, pageURL, apiURL) {
  const page = new URL(pageURL);
  const api = new URL(apiURL);
  return data?.approvalExperiment === true
    && localHosts.has(page.hostname) && ['http:', 'https:'].includes(page.protocol)
    && localHosts.has(api.hostname) && api.protocol === 'http:' && api.port === '54321';
}

export function allowApprovalOutbox(data,pageURL,apiURL) {
  return data?.approvalOutbox === true && allowApprovalExperiment(data,pageURL,apiURL);
}

export function allowApprovalFollow(data,pageURL,apiURL) {
  return data?.approvalFollow === true && allowApprovalExperiment(data,pageURL,apiURL);
}
