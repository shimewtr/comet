/**
 * 拡張の設定（chrome.storage.syncに保存）
 */
export interface CometSettings {
  /** 接続先WebSocket URL */
  websocketUrl: string;
  /** コメント速度の倍率（0.5〜2.0） */
  speedScale: number;
  /** コメント文字サイズの倍率（0.5〜2.0） */
  fontScale: number;
  /** コメントを流す領域 */
  displayArea: 'full' | 'top-half' | 'top-third';
  /** 参加用QRコードを表示するか */
  qrEnabled: boolean;
  /** QRコードに載せるWebアプリのURL */
  webAppUrl: string;
  /** Room履歴APIのURL（comet-config.jsonから取得） */
  historyApiUrl: string;
  /** Google Slidesの表示画面をRoom履歴に記録するか */
  captureEnabled: boolean;
  /** 認証チケット（認証を有効化した構成でのみ使用。通常は空でよい） */
  authToken: string;
  /** 認証チケットの有効期限（Unix epoch milliseconds） */
  authTokenExpiresAt: number;
  /** 表示対象room */
  roomId: string;
}

export const DEFAULT_SETTINGS: CometSettings = {
  websocketUrl: '',
  speedScale: 1,
  fontScale: 1,
  displayArea: 'full',
  qrEnabled: false,
  webAppUrl: '',
  historyApiUrl: '',
  captureEnabled: false,
  authToken: '',
  authTokenExpiresAt: 0,
  roomId: 'global',
};

/**
 * 設定を読み込む（未保存の項目はデフォルト値で埋める）
 */
export async function loadSettings(): Promise<CometSettings> {
  const [stored, localAuth] = await Promise.all([
    chrome.storage.sync.get(DEFAULT_SETTINGS),
    chrome.storage.local.get(['authToken', 'authTokenExpiresAt']),
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...stored } as CometSettings;
  settings.authToken =
    typeof localAuth.authToken === 'string'
      ? localAuth.authToken
      : settings.authToken;
  settings.authTokenExpiresAt =
    typeof localAuth.authTokenExpiresAt === 'number'
      ? localAuth.authTokenExpiresAt
      : settings.authTokenExpiresAt;
  if (settings.authTokenExpiresAt <= Date.now()) {
    settings.authToken = '';
  }
  return settings;
}
