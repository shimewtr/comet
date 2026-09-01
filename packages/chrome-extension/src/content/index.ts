import {
  WebSocketMessageType,
  CometSocket,
  GLOBAL_ROOM_ID,
} from '@comet/shared';
import { CommentRenderer } from './comment-renderer';
import { StampRenderer } from './stamp-renderer';
import { QrRenderer } from './qr-renderer';
import { loadSettings, CometSettings } from '../settings';

let wsClient: CometSocket | null = null;
let currentWebsocketUrl = '';
let currentAuthToken = '';
let desiredRoomId = GLOBAL_ROOM_ID;
let joinedRoomId: string | null = null;
let commentRenderer: CommentRenderer | null = null;
let stampRenderer: StampRenderer | null = null;
let qrRenderer: QrRenderer | null = null;
let currentSettings: CometSettings | null = null;
let captureTimer: number | null = null;
let captureDebounceTimer: number | null = null;
let captureObserver: MutationObserver | null = null;
let captureInProgress = false;
let lastCaptureFingerprint = '';

function updateQr(roomId: string | null): void {
  if (!currentSettings?.qrEnabled || !currentSettings.webAppUrl || !roomId) {
    qrRenderer?.hide();
    return;
  }
  const roomUrl = new URL(currentSettings.webAppUrl);
  if (roomId === GLOBAL_ROOM_ID) roomUrl.searchParams.delete('room');
  else roomUrl.searchParams.set('room', roomId);
  void qrRenderer?.show(roomUrl.toString());
}

async function getDeviceId(): Promise<string> {
  const stored = await chrome.storage.local.get('captureDeviceId');
  if (typeof stored.captureDeviceId === 'string') return stored.captureDeviceId;
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ captureDeviceId: deviceId });
  return deviceId;
}

function slideFingerprint(): string {
  const candidates = [
    '.punch-viewer-page-wrapper:not([style*="display: none"])',
    '.sketchy-content-text',
    '[aria-label*="Slide"]',
    '[aria-label*="スライド"]',
  ];
  const slide = candidates
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find(Boolean);
  return `${location.href}|${slide?.getAttribute('aria-label') ?? ''}|${slide?.textContent?.trim().slice(0, 500) ?? ''}`;
}

async function claimRecorder(
  settings: CometSettings,
  roomId: string,
  deviceId: string
): Promise<boolean> {
  const response = await fetch(
    `${settings.historyApiUrl}/rooms/${encodeURIComponent(roomId)}/recorder`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    }
  );
  return response.ok;
}

async function captureSlide(force = false): Promise<void> {
  const settings = currentSettings;
  const roomId = joinedRoomId;
  if (
    captureInProgress ||
    !settings?.captureEnabled ||
    !settings.historyApiUrl ||
    !roomId ||
    roomId === GLOBAL_ROOM_ID
  )
    return;
  const fingerprint = slideFingerprint();
  if (!force && fingerprint === lastCaptureFingerprint) return;
  captureInProgress = true;
  try {
    const deviceId = await getDeviceId();
    if (!(await claimRecorder(settings, roomId, deviceId))) {
      console.info('Comet: Another presenter is recording this Room.');
      return;
    }
    const overlays = [
      'comet-comment-container',
      'comet-stamp-container',
      'comet-qr-container',
    ]
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    const visibility = overlays.map((element) => element.style.visibility);
    overlays.forEach((element) => {
      element.style.visibility = 'hidden';
    });
    let result: { success: boolean; dataUrl?: string; error?: string };
    try {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      result = await chrome.runtime.sendMessage({
        type: 'CAPTURE_VISIBLE_TAB',
      });
    } finally {
      overlays.forEach((element, index) => {
        element.style.visibility = visibility[index];
      });
    }
    if (!result.success || !result.dataUrl)
      throw new Error(result.error ?? 'Capture failed');
    const response = await fetch(
      `${settings.historyApiUrl}/rooms/${encodeURIComponent(roomId)}/captures`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          dataUrl: result.dataUrl,
          capturedAt: Date.now(),
        }),
      }
    );
    if (!response.ok)
      throw new Error(`Capture upload failed: HTTP ${response.status}`);
    lastCaptureFingerprint = fingerprint;
  } catch (error) {
    console.warn('Comet: Failed to record the slide:', error);
  } finally {
    captureInProgress = false;
  }
}

function configureCapture(): void {
  if (captureTimer !== null) window.clearInterval(captureTimer);
  if (captureDebounceTimer !== null) window.clearTimeout(captureDebounceTimer);
  captureObserver?.disconnect();
  captureTimer = null;
  captureDebounceTimer = null;
  captureObserver = null;
  if (
    !currentSettings?.captureEnabled ||
    !currentSettings.historyApiUrl ||
    !joinedRoomId ||
    joinedRoomId === GLOBAL_ROOM_ID
  )
    return;

  const schedule = () => {
    if (captureDebounceTimer !== null)
      window.clearTimeout(captureDebounceTimer);
    captureDebounceTimer = window.setTimeout(() => void captureSlide(), 800);
  };
  captureObserver = new MutationObserver(schedule);
  captureObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  captureTimer = window.setInterval(() => void captureSlide(true), 60_000);
  void captureSlide(true);
}

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

  const socket = new CometSocket(websocketUrl, {
    // 認証を有効化した構成では設定済みチケットを接続に付与する（空ならno-op）
    tokenProvider: () => currentAuthToken || null,
  });

  // 新規コメント受信ハンドラー
  socket.on(
    WebSocketMessageType.NEW_COMMENT,
    (payload, message) => {
      // room参加完了前のglobal配信や、遅延した旧roomイベントは表示しない
      if (joinedRoomId && message.roomId === joinedRoomId) {
        commentRenderer?.renderComment(payload.comment);
      }
    }
  );

  // 新規スタンプ受信ハンドラー
  socket.on(
    WebSocketMessageType.NEW_STAMP,
    (payload, message) => {
      if (joinedRoomId && message.roomId === joinedRoomId) {
        stampRenderer?.renderStamp(payload.stamp);
      }
    }
  );

  socket.on(WebSocketMessageType.ROOM_JOINED, ({ room }) => {
    joinedRoomId = room.id;
    updateQr(room.id);
    configureCapture();
  });

  socket.on(WebSocketMessageType.ERROR, ({ fallbackRoom }) => {
    if (!fallbackRoom) return;
    desiredRoomId = fallbackRoom.id;
    joinedRoomId = fallbackRoom.id;
    updateQr(fallbackRoom.id);
    configureCapture();
    void chrome.storage.sync.set({ roomId: fallbackRoom.id });
  });

  socket
    .connect()
    .then(() => {
      console.log('Comet: Connected to WebSocket');
      joinedRoomId = null;
      socket.send(WebSocketMessageType.JOIN_ROOM, { roomId: desiredRoomId });
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
  currentSettings = settings;

  commentRenderer?.updateDisplaySettings({
    speedScale: settings.speedScale,
    fontScale: settings.fontScale,
    displayArea: settings.displayArea,
  });
  commentRenderer?.setOpacity(settings.commentOpacity);

  // サイズ倍率はコメント文字とスタンプで共通の設定値を使う
  stampRenderer?.updateDisplaySettings({ sizeScale: settings.fontScale });
  stampRenderer?.setOpacity(settings.stampOpacity);

  // JOIN_ROOM成功後の確定RoomだけをQRコードと記録対象に反映する
  updateQr(joinedRoomId);
  configureCapture();

  // WebSocket接続（URLまたはトークンが変わったときだけ張り直す）
  const tokenChanged = settings.authToken !== currentAuthToken;
  const roomChanged = settings.roomId !== desiredRoomId;
  currentAuthToken = settings.authToken;
  desiredRoomId = settings.roomId;
  if (
    settings.websocketUrl !== currentWebsocketUrl ||
    tokenChanged ||
    !wsClient
  ) {
    connectWebSocket(settings.websocketUrl);
  } else if (roomChanged && wsClient.isOpen) {
    joinedRoomId = null;
    wsClient.send(WebSocketMessageType.JOIN_ROOM, { roomId: desiredRoomId });
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
  if (captureTimer !== null) window.clearInterval(captureTimer);
  if (captureDebounceTimer !== null) window.clearTimeout(captureDebounceTimer);
  captureObserver?.disconnect();
}

/**
 * popupでの設定変更をリロードなしで反映する
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' && area !== 'local') {
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
