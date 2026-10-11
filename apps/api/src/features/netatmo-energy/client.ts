export type NetatmoDevice = { clientKey: string; parentClientKey: string | null; device: { name: string; deviceClass: string; deviceType: string; technology: string; manufacturer: string; model: string; description: string; identities: { identityType: string; value: string; source: string; isPrimary: boolean }[] } };
export type Discovery = { homes: number; devices: NetatmoDevice[] };
export type NetatmoConfig = { baseUrl: string; clientId: string; clientSecret: string; redirectUri: string };
export function netatmoConfig(env: NodeJS.ProcessEnv = process.env): NetatmoConfig | null {
  const baseUrl = env.SENSORSPHERE_NETATMO_BASE_URL?.trim();
  if (!baseUrl) return null;
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid Netatmo base URL');
  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && !/^(100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/.test(parsed.hostname)) throw new Error('Netatmo HTTP endpoint must be local or Tailnet');
  return { baseUrl: parsed.origin, clientId: env.SENSORSPHERE_NETATMO_CLIENT_ID || 'sim-client', clientSecret: env.SENSORSPHERE_NETATMO_CLIENT_SECRET || 'sim-secret', redirectUri: env.SENSORSPHERE_NETATMO_REDIRECT_URI || 'http://127.0.0.1/callback' };
}
async function apiJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Netatmo upstream HTTP ${response.status}`);
  return response.json();
}
export async function exchangeCode(config: NetatmoConfig, code: string): Promise<{ access_token: string; refresh_token: string }> {
  return apiJson(`${config.baseUrl}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, client_id: config.clientId, client_secret: config.clientSecret }) });
}
export async function discover(config: NetatmoConfig, accessToken: string): Promise<Discovery> {
  const response = await apiJson(`${config.baseUrl}/api/homesdata`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!Array.isArray(response?.body?.homes)) throw new Error('Invalid homesdata response');
  const devices: NetatmoDevice[] = [];
  const unique = new Set<string>();
  for (const home of response.body.homes) {
    if (typeof home.id !== 'string' || !Array.isArray(home.modules)) throw new Error('Invalid Netatmo home');
    for (const module of home.modules) {
      if (typeof module.id !== 'string' || typeof module.type !== 'string') throw new Error('Invalid Netatmo module');
      const key = `${home.id}:${module.id}`;
      if (unique.has(key)) continue;
      unique.add(key);
      const thermostat = module.type === 'NATherm1';
      const parentClientKey = thermostat && module.bridge ? `${home.id}:${module.bridge}` : null;
      devices.push({ clientKey: key, parentClientKey, device: { name: module.name || (thermostat ? 'Netatmo Thermostat' : 'Netatmo Relay'), deviceClass: thermostat ? 'IOT' : 'INFRASTRUCTURE', deviceType: thermostat ? 'thermostat' : 'gateway', technology: 'http', manufacturer: 'Netatmo', model: module.type, description: `Netatmo Energy home ${home.id}`, identities: [{ identityType: 'NETATMO_MODULE_ID', value: `${home.id}:${module.id}`, source: 'NETATMO_ENERGY', isPrimary: true }] } });
    }
  }
  devices.sort((a,b) => Number(a.parentClientKey !== null) - Number(b.parentClientKey !== null));
  return { homes: response.body.homes.length, devices };
}
