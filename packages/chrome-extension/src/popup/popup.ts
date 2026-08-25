import { DEFAULT_SETTINGS, loadSettings } from '../settings';
import {
  CometSocket,
  WebSocketMessageType,
  RoomListPayload,
  GLOBAL_ROOM,
} from '@comet/shared';

/**
 * DOM要素をnullチェック付きで取得する
 */
function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element not found: #${id}`);
  }
  return element as T;
}

/**
 * 保存メッセージを表示
 */
function showSaveMessage(
  saveMessage: HTMLDivElement,
  message: string,
  type: 'success' | 'error'
) {
  saveMessage.textContent = message;
  saveMessage.style.color = type === 'success' ? '#4a90e2' : '#f56565';

  // 3秒後にメッセージを消す
  setTimeout(() => {
    saveMessage.textContent = '';
  }, 3000);
}

/** Web配信用URLをWebSocket URLとして誤入力していないか検証する */
function hasSameHostname(firstUrl: string, secondUrl: string): boolean {
  if (!firstUrl || !secondUrl) return false;
  try {
    return new URL(firstUrl).hostname === new URL(secondUrl).hostname;
  } catch {
    return false;
  }
}

async function fetchCometConfig(webAppUrl: string): Promise<{ websocketUrl: string; historyApiUrl: string }> {
  const response = await fetch(`${webAppUrl.replace(/\/+$/, '')}/comet-config.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const config = await response.json();
  if (
    typeof config.websocketUrl !== 'string' ||
    (!config.websocketUrl.startsWith('wss://') && !config.websocketUrl.startsWith('ws://'))
  ) throw new Error('Invalid WebSocket URL');
  if (hasSameHostname(config.websocketUrl, webAppUrl)) {
    throw new Error('WebSocket URL points to the web hosting domain');
  }
  return {
    websocketUrl: config.websocketUrl,
    historyApiUrl: typeof config.historyApiUrl === 'string' ? config.historyApiUrl.replace(/\/+$/, '') : '',
  };
}

async function main() {
  const toggleCheckbox = getElement<HTMLInputElement>('toggle-checkbox');
  const websocketUrlInput = getElement<HTMLInputElement>('websocket-url');
  const historyApiUrlInput = getElement<HTMLInputElement>('history-api-url');
  const authTokenInput = getElement<HTMLInputElement>('auth-token');
  const roomSelect = getElement<HTMLSelectElement>('room-select');
  const refreshRoomsButton = getElement<HTMLButtonElement>('refresh-rooms');
  const speedScaleInput = getElement<HTMLInputElement>('speed-scale');
  const speedScaleValue = getElement<HTMLSpanElement>('speed-scale-value');
  const fontScaleInput = getElement<HTMLInputElement>('font-scale');
  const fontScaleValue = getElement<HTMLSpanElement>('font-scale-value');
  const displayAreaSelect = getElement<HTMLSelectElement>('display-area');
  const qrEnabledCheckbox = getElement<HTMLInputElement>('qr-enabled');
  const captureEnabledCheckbox = getElement<HTMLInputElement>('capture-enabled');
  const webAppUrlInput = getElement<HTMLInputElement>('web-app-url');
  const fetchConfigButton = getElement<HTMLButtonElement>('fetch-config');
  const saveSettingsButton = getElement<HTMLButtonElement>('save-settings');
  const saveMessage = getElement<HTMLDivElement>('save-message');
  let historyApiUrl = '';

  const loadRooms = async (
    websocketUrl: string,
    authToken: string,
    selectedRoomId: string
  ) => {
    if (!websocketUrl) return;
    refreshRoomsButton.disabled = true;
    const socket = new CometSocket(websocketUrl, {
      tokenProvider: () => authToken || null,
      keepaliveIntervalMs: 0,
      maxReconnectAttempts: 0,
    });
    try {
      const rooms = await new Promise<RoomListPayload['rooms']>(
        async (resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Room list timeout')),
            5000
          );
          socket.on<RoomListPayload>(
            WebSocketMessageType.ROOM_LIST,
            ({ rooms }) => {
              clearTimeout(timeout);
              resolve(rooms);
            }
          );
          await socket.connect();
          socket.send(WebSocketMessageType.ROOM_LIST_REQUEST, {});
        }
      );
      roomSelect.replaceChildren();
      rooms.forEach((room) => {
        const option = document.createElement('option');
        option.value = room.id;
        option.textContent = `${room.name}${room.id === 'global' ? '' : ` (${room.id.slice(0, 8)})`}`;
        roomSelect.append(option);
      });
      roomSelect.value = rooms.some((room) => room.id === selectedRoomId)
        ? selectedRoomId
        : GLOBAL_ROOM.id;
    } catch (error) {
      console.error('Failed to load rooms:', error);
      showSaveMessage(saveMessage, 'Room一覧の取得に失敗しました', 'error');
    } finally {
      socket.disconnect();
      refreshRoomsButton.disabled = false;
    }
  };

  // スライダーの現在値表示
  const updateScaleLabels = () => {
    speedScaleValue.textContent = Number(speedScaleInput.value).toFixed(1);
    fontScaleValue.textContent = Number(fontScaleInput.value).toFixed(1);
  };
  speedScaleInput.addEventListener('input', updateScaleLabels);
  fontScaleInput.addEventListener('input', updateScaleLabels);

  // 表示切り替え
  toggleCheckbox.addEventListener('change', async () => {
    const isEnabled = toggleCheckbox.checked;

    // アクティブなタブにメッセージを送信
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_COMMENTS',
          enabled: isEnabled,
        });
      } catch (error) {
        console.log('Failed to send message to tab:', error);
        // タブにコンテンツスクリプトが読み込まれていない場合でも続行
        // 状態はストレージに保存されるので、次回ページ読み込み時に反映される
      }
    }

    // 状態を保存
    chrome.storage.local.set({ commentsEnabled: isEnabled });
  });

  // WebアプリのURLから接続設定（/comet-config.json）を自動取得する
  fetchConfigButton.addEventListener('click', async () => {
    const webAppUrl = webAppUrlInput.value.trim().replace(/\/+$/, '');

    if (!webAppUrl) {
      showSaveMessage(
        saveMessage,
        '先に「WebアプリURL」を入力してください',
        'error'
      );
      return;
    }

    fetchConfigButton.disabled = true;
    try {
      const config = await fetchCometConfig(webAppUrl);

      websocketUrlInput.value = config.websocketUrl;
      historyApiUrl = typeof config.historyApiUrl === 'string'
        ? config.historyApiUrl.replace(/\/+$/, '')
        : '';
      historyApiUrlInput.value = historyApiUrl;
      const settings = await loadSettings();
      await loadRooms(
        config.websocketUrl,
        authTokenInput.value.trim(),
        settings.roomId
      );
      showSaveMessage(
        saveMessage,
        '接続設定を取得しました。「保存」で確定してください',
        'success'
      );
    } catch (error) {
      console.error('Failed to fetch comet-config.json:', error);
      showSaveMessage(
        saveMessage,
        '設定の取得に失敗しました。WebアプリURLを確認してください',
        'error'
      );
    } finally {
      fetchConfigButton.disabled = false;
    }
  });

  refreshRoomsButton.addEventListener('click', async () => {
    await loadRooms(
      websocketUrlInput.value.trim(),
      authTokenInput.value.trim(),
      roomSelect.value || GLOBAL_ROOM.id
    );
  });

  // 設定を保存（content scriptはstorage.onChangedで即時反映する）
  saveSettingsButton.addEventListener('click', async () => {
    let websocketUrl = websocketUrlInput.value.trim();
    const webAppUrl = webAppUrlInput.value.trim().replace(/\/+$/, '');

    if (!webAppUrl) {
      showSaveMessage(saveMessage, 'WebアプリURLを入力してください', 'error');
      return;
    }

    if (
      !webAppUrl.startsWith('https://') &&
      !webAppUrl.startsWith('http://')
    ) {
      showSaveMessage(
        saveMessage,
        'WebアプリURLは https:// で始まる必要があります',
        'error'
      );
      return;
    }

    saveSettingsButton.disabled = true;
    try {
      const config = await fetchCometConfig(webAppUrl);
      websocketUrl = config.websocketUrl;
      historyApiUrl = config.historyApiUrl;
      websocketUrlInput.value = websocketUrl;
      historyApiUrlInput.value = historyApiUrl;
    } catch (error) {
      console.error('Failed to fetch connection settings:', error);
      showSaveMessage(saveMessage, '接続設定の取得に失敗しました。WebアプリURLを確認してください', 'error');
      saveSettingsButton.disabled = false;
      return;
    }

    if (qrEnabledCheckbox.checked && !webAppUrl) {
      showSaveMessage(
        saveMessage,
        'QRコードを表示するにはWebアプリURLを入力してください',
        'error'
      );
      return;
    }

    if (captureEnabledCheckbox.checked && !historyApiUrl) {
      showSaveMessage(saveMessage, 'このWebアプリには履歴APIが設定されていません', 'error');
      saveSettingsButton.disabled = false;
      return;
    }

    await chrome.storage.sync.set({
      websocketUrl,
      authToken: authTokenInput.value.trim(),
      roomId: roomSelect.value || GLOBAL_ROOM.id,
      speedScale: Number(speedScaleInput.value) || DEFAULT_SETTINGS.speedScale,
      fontScale: Number(fontScaleInput.value) || DEFAULT_SETTINGS.fontScale,
      displayArea: displayAreaSelect.value,
      qrEnabled: qrEnabledCheckbox.checked,
      webAppUrl,
      historyApiUrl,
      captureEnabled: captureEnabledCheckbox.checked,
    });

    showSaveMessage(saveMessage, '設定を保存しました！', 'success');
    saveSettingsButton.disabled = false;
  });

  // 保存された状態を読み込む
  const localResult = await chrome.storage.local.get('commentsEnabled');
  toggleCheckbox.checked = localResult.commentsEnabled !== false; // デフォルトはtrue

  const settings = await loadSettings();
  historyApiUrl = settings.historyApiUrl;
  historyApiUrlInput.value = historyApiUrl;
  websocketUrlInput.value = settings.websocketUrl;
  authTokenInput.value = settings.authToken;
  speedScaleInput.value = String(settings.speedScale);
  fontScaleInput.value = String(settings.fontScale);
  displayAreaSelect.value = settings.displayArea;
  qrEnabledCheckbox.checked = settings.qrEnabled;
  captureEnabledCheckbox.checked = settings.captureEnabled;
  webAppUrlInput.value = settings.webAppUrl;
  roomSelect.innerHTML = `<option value="global">${GLOBAL_ROOM.name}</option>`;
  roomSelect.value = settings.roomId;
  updateScaleLabels();
  if (!historyApiUrl && settings.webAppUrl) {
    try {
      const config = await fetchCometConfig(settings.webAppUrl);
      historyApiUrl = config.historyApiUrl;
      historyApiUrlInput.value = historyApiUrl;
      websocketUrlInput.value = config.websocketUrl;
      await chrome.storage.sync.set({ historyApiUrl, websocketUrl: config.websocketUrl });
    } catch (error) {
      console.warn('Comet popup: Failed to initialize runtime config:', error);
    }
  }
  await loadRooms(websocketUrlInput.value, settings.authToken, settings.roomId);
}

main().catch((error) => {
  console.error('Comet popup: Failed to initialize:', error);
});
