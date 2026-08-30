/**
 * 認証チケットの取得まわり。
 * 認証が有効な構成（/comet-config.json の authEnabled が true）でだけ動き、
 * 無効な構成ではすべてno-opになる。
 */

export interface RuntimeConfig {
  websocketUrl?: string;
  historyApiUrl?: string;
  stampApiUrl?: string;
  authEnabled?: boolean;
}

let configPromise: Promise<RuntimeConfig> | null = null;

/**
 * 配信物に含まれるランタイム設定を読む（同一オリジン）。
 * ローカル開発などファイルがない環境では空設定＝認証なしとして扱う
 */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (!configPromise) {
    configPromise = fetch('/comet-config.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }
  return configPromise;
}

let cachedTicket: { token: string; expiresAt: number } | null = null;

export interface AuthTicket {
  token: string;
  expiresAt: number;
}

export async function getAuthTicket(): Promise<AuthTicket | null> {
  const config = await loadRuntimeConfig();
  if (!config.authEnabled) {
    return null;
  }

  if (cachedTicket && cachedTicket.expiresAt - 60_000 > Date.now()) {
    return cachedTicket;
  }

  try {
    const response = await fetch('/auth/token', { cache: 'no-store' });
    if (!response.ok) {
      console.error('Failed to get auth token:', response.status);
      return null;
    }
    const data = await response.json();
    if (typeof data.token !== 'string') return null;
    cachedTicket = {
      token: data.token,
      expiresAt: data.expiresAt ?? Date.now() + 5 * 60_000,
    };
    return cachedTicket;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

/**
 * 認証チケットを取得する（認証が無効ならnull）。
 * チケットはエッジの /auth/token が発行し、期限が近づくまでキャッシュする
 */
export async function getAuthToken(): Promise<string | null> {
  return (await getAuthTicket())?.token ?? null;
}

/**
 * スタンプAPI呼び出しに付けるヘッダー（認証が無効なら空）
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
