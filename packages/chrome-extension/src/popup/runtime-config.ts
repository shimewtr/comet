export interface CometRuntimeConfig {
  websocketUrl: string;
  historyApiUrl: string;
  authEnabled: boolean;
}

function hasSameHostname(firstUrl: string, secondUrl: string): boolean {
  if (!firstUrl || !secondUrl) return false;
  try { return new URL(firstUrl).hostname === new URL(secondUrl).hostname; }
  catch { return false; }
}

/** Requests the minimum origin permission needed to read the Web app's runtime config. */
export function ensureWebAppPermission(webAppUrl: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`${new URL(webAppUrl).origin}/*`] });
}

export async function fetchCometConfig(webAppUrl: string): Promise<CometRuntimeConfig> {
  const response = await fetch(`${webAppUrl.replace(/\/+$/, '')}/comet-config.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const config: unknown = await response.json();
  if (!config || typeof config !== 'object') throw new Error('Invalid runtime config');
  const value = config as Record<string, unknown>;
  if (typeof value.websocketUrl !== 'string' || (!value.websocketUrl.startsWith('wss://') && !value.websocketUrl.startsWith('ws://'))) {
    throw new Error('Invalid WebSocket URL');
  }
  if (hasSameHostname(value.websocketUrl, webAppUrl)) throw new Error('WebSocket URL points to the web hosting domain');
  return {
    websocketUrl: value.websocketUrl,
    historyApiUrl: typeof value.historyApiUrl === 'string' ? value.historyApiUrl.replace(/\/+$/, '') : '',
    authEnabled: value.authEnabled === true,
  };
}
