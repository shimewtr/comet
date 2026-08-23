import {
  WebSocketMessageType,
  NewCommentPayload,
  NewStampPayload,
  CometSocket,
} from '@comet/shared';
import { CommentRenderer } from './comment-renderer';
import { StampRenderer } from './stamp-renderer';
import { QrRenderer } from './qr-renderer';
import { loadSettings, CometSettings } from '../settings';

let wsClient: CometSocket | null = null;
let currentWebsocketUrl = '';
let commentRenderer: CommentRenderer | null = null;
let stampRenderer: StampRenderer | null = null;
let qrRenderer: QrRenderer | null = null;

/**
 * レンダラーを初期化（初回のみ）
 */
function ensureRenderers(): void {
  if (!commentRenderer) {
    commentRenderer = new CommentRenderer();
  }
  if (!stampRenderer) {
    stampRenderer = new StampRenderer();
  }
  if (!qrRenderer) {
    qrRenderer = new QrRenderer();
  }
}

/**
 * WebSocket接続を張り直す（URLが変わったときのみ呼ばれる）
 */
function connectWebSocket(websocketUrl: string): void {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  currentWebsocketUrl = websocketUrl;

  if (!websocketUrl) {
    console.error(
      'Comet: WebSocket URL is not configured. Please set it in the extension popup.'
    );
    return;
  }

  const socket = new CometSocket(websocketUrl);

  // 新規コメント受信ハンドラー
  socket.on<NewCommentPayload>(WebSocketMessageType.NEW_COMMENT, (payload) => {
    commentRenderer?.renderComment(payload.comment);
  });

  // 新規スタンプ受信ハンドラー
  socket.on<NewStampPayload>(WebSocketMessageType.NEW_STAMP, (payload) => {
    stampRenderer?.renderStamp(payload.stamp);
  });

  socket
    .connect()
    .then(() => {
      console.log('Comet: Connected to WebSocket');
    })
    .catch((error) => {
      console.error('Comet: Failed to connect to WebSocket:', error);
    });

  wsClient = socket;
}

/**
 * 設定を各コンポーネントに反映する
 */
function applySettings(settings: CometSettings): void {
  ensureRenderers();

  commentRenderer?.updateDisplaySettings({
    speedScale: settings.speedScale,
    fontScale: settings.fontScale,
    displayArea: settings.displayArea,
  });

  // 参加用QRコード
  if (settings.qrEnabled && settings.webAppUrl) {
    qrRenderer?.show(settings.webAppUrl);
  } else {
    qrRenderer?.hide();
  }

  // WebSocket接続（URLが変わったときだけ張り直す）
  if (settings.websocketUrl !== currentWebsocketUrl || !wsClient) {
    connectWebSocket(settings.websocketUrl);
  }
}

/**
 * 初期化
 */
async function initialize() {
  console.log('Comet: Initializing...');

  ensureRenderers();

  // 保存された表示状態を復元
  const localResult = await chrome.storage.local.get('commentsEnabled');
  const isEnabled = localResult.commentsEnabled !== false; // デフォルトはtrue
  if (!isEnabled) {
    commentRenderer?.disable();
    stampRenderer?.disable();
  }

  const settings = await loadSettings();
  applySettings(settings);
}

/**
 * クリーンアップ
 */
function cleanup() {
  if (wsClient) {
    wsClient.disconnect();
  }

  commentRenderer?.destroy();
  stampRenderer?.destroy();
  qrRenderer?.destroy();
}

/**
 * popupでの設定変更をリロードなしで反映する
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') {
    return;
  }

  loadSettings()
    .then((settings) => applySettings(settings))
    .catch((error) => {
      console.error('Comet: Failed to apply settings:', error);
    });
});

/**
 * Chrome拡張からのメッセージハンドラー
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_COMMENTS':
      if (message.enabled) {
        // コメント・スタンプ表示を有効化
        commentRenderer?.enable();
        stampRenderer?.enable();
      } else {
        // コメント・スタンプ表示を無効化
        commentRenderer?.disable();
        stampRenderer?.disable();
      }
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true; // 非同期レスポンスを許可
});

/**
 * ページ離脱時のクリーンアップ
 */
window.addEventListener('beforeunload', cleanup);

/**
 * エントリーポイント
 */
initialize().catch((error) => {
  console.error('Comet: Failed to initialize:', error);
});
