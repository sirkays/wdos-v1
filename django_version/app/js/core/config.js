/**
 * WDOS runtime configuration.
 * Loaded from /wdos-config.json at boot (Phase 221: renamed from config.json,
 * because Netlify Drop now treats a root config.json as a Hugo site and runs
 * a Hugo build that fails) so no environment value is hard-coded
 * in application source. Netlify serves a per-environment wdos-config.json.
 */
let config = null;

export async function loadConfig() {
  if (config) return config;
  const res = await fetch('/wdos-config.json', { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`wdos-config.json could not be loaded (HTTP ${res.status})`);
  }
  const raw = await res.json();
  for (const key of ['supabaseUrl', 'supabaseAnonKey']) {
    if (!raw[key]) throw new Error(`wdos-config.json is missing "${key}"`);
  }
  config = Object.freeze({
    supabaseUrl: raw.supabaseUrl,
    supabaseAnonKey: raw.supabaseAnonKey,
    defaultLocale: raw.defaultLocale ?? 'en',
    appName: raw.appName ?? 'WDOS',
    environment: raw.environment ?? 'production',
  });
  return config;
}

export function getConfig() {
  if (!config) throw new Error('loadConfig() must complete before getConfig()');
  return config;
}
