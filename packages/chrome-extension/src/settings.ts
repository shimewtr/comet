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
}

export const DEFAULT_SETTINGS: CometSettings = {
  websocketUrl: '',
  speedScale: 1,
  fontScale: 1,
  displayArea: 'full',
  qrEnabled: false,
  webAppUrl: '',
};

/**
 * 設定を読み込む（未保存の項目はデフォルト値で埋める）
 */
export async function loadSettings(): Promise<CometSettings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored } as CometSettings;
}
