import { DEFAULT_SETTINGS, loadSettings } from '../settings';
import { GLOBAL_ROOM } from '@comet/shared';
import { loadRoomList, populateRoomSelect } from './room-list';
import { ensureWebAppPermission, fetchCometConfig } from './runtime-config';

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


async function main() {
  const toggleCheckbox = getElement<HTMLInputElement>('toggle-checkbox');
  const authPanel = getElement<HTMLDivElement>('auth-panel');
  const authStatus = getElement<HTMLSpanElement>('auth-status');
  const startAuthButton = getElement<HTMLButtonElement>('start-auth');
  const roomSelect = getElement<HTMLSelectElement>('room-select');
  const refreshRoomsButton = getElement<HTMLButtonElement>('refresh-rooms');
  const speedScaleInput = getElement<HTMLInputElement>('speed-scale');
  const speedScaleValue = getElement<HTMLSpanElement>('speed-scale-value');
  const fontScaleInput = getElement<HTMLInputElement>('font-scale');
  const fontScaleValue = getElement<HTMLSpanElement>('font-scale-value');
  const commentOpacityInput = getElement<HTMLInputElement>('comment-opacity');
  const commentOpacityValue = getElement<HTMLSpanElement>(
    'comment-opacity-value'
  );
  const stampOpacityInput = getElement<HTMLInputElement>('stamp-opacity');
  const stampOpacityValue = getElement<HTMLSpanElement>('stamp-opacity-value');
  const displayAreaSelect = getElement<HTMLSelectElement>('display-area');
  const qrEnabledCheckbox = getElement<HTMLInputElement>('qr-enabled');
  const captureEnabledCheckbox =
    getElement<HTMLInputElement>('capture-enabled');
  const webAppUrlInput = getElement<HTMLInputElement>('web-app-url');
  const fetchConfigButton = getElement<HTMLButtonElement>('fetch-config');
  const saveSettingsButton = getElement<HTMLButtonElement>('save-settings');
  const saveMessage = getElement<HTMLDivElement>('save-message');
  let websocketUrl = '';
  let historyApiUrl = '';
  let authEnabled = false;

  const hasValidToken = (token: string, expiresAt: number) =>
    Boolean(token) && expiresAt - 60_000 > Date.now();

  const updateAuthUi = (token: string, expiresAt: number) => {
    authPanel.classList.toggle('hidden', !authEnabled);
    if (!authEnabled) return;
    const authenticated = hasValidToken(token, expiresAt);
    authStatus.textContent = authenticated ? 'ログイン済み' : '未ログイン';
    authStatus.classList.toggle('authenticated', authenticated);
    startAuthButton.textContent = authenticated ? '再ログイン' : 'ログイン';
  };

  const loadRooms = async (
    websocketUrl: string,
    authToken: string,
    selectedRoomId: string
  ) => {
    if (!websocketUrl) return;
    refreshRoomsButton.disabled = true;
    try {
      populateRoomSelect(
        roomSelect,
        await loadRoomList(websocketUrl, authToken),
        selectedRoomId
      );
    } catch (error) {
      console.error('Failed to load rooms:', error);
      showSaveMessage(saveMessage, 'Room一覧の取得に失敗しました', 'error');
    } finally {
      refreshRoomsButton.disabled = false;
    }
  };

  // スライダーの現在値表示
  const toPercent = (value: string) => String(Math.round(Number(value) * 100));
  const updateRangeLabels = () => {
    speedScaleValue.textContent = Number(speedScaleInput.value).toFixed(1);
    fontScaleValue.textContent = Number(fontScaleInput.value).toFixed(1);
    commentOpacityValue.textContent = toPercent(commentOpacityInput.value);
    stampOpacityValue.textContent = toPercent(stampOpacityInput.value);
  };
  speedScaleInput.addEventListener('input', updateRangeLabels);
  fontScaleInput.addEventListener('input', updateRangeLabels);
  commentOpacityInput.addEventListener('input', updateRangeLabels);
  stampOpacityInput.addEventListener('input', updateRangeLabels);

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
      if (!(await ensureWebAppPermission(webAppUrl))) {
        showSaveMessage(
          saveMessage,
          'Webアプリへのアクセスを許可してください',
          'error'
        );
        return;
      }
      const config = await fetchCometConfig(webAppUrl);

      websocketUrl = config.websocketUrl;
      historyApiUrl =
        typeof config.historyApiUrl === 'string'
          ? config.historyApiUrl.replace(/\/+$/, '')
          : '';
      authEnabled = config.authEnabled;
      const settings = await loadSettings();
      updateAuthUi(settings.authToken, settings.authTokenExpiresAt);
      if (
        !authEnabled ||
        hasValidToken(settings.authToken, settings.authTokenExpiresAt)
      ) {
        await loadRooms(
          config.websocketUrl,
          settings.authToken,
          settings.roomId
        );
      }
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
    const settings = await loadSettings();
    if (
      authEnabled &&
      !hasValidToken(settings.authToken, settings.authTokenExpiresAt)
    ) {
      showSaveMessage(saveMessage, '先にログインしてください', 'error');
      return;
    }
    await loadRooms(
      websocketUrl,
      settings.authToken,
      roomSelect.value || GLOBAL_ROOM.id
    );
  });

  startAuthButton.addEventListener('click', async () => {
    const webAppUrl = webAppUrlInput.value.trim().replace(/\/+$/, '');
    if (!webAppUrl) {
      showSaveMessage(
        saveMessage,
        '先にWebアプリURLを保存してください',
        'error'
      );
      return;
    }
    await chrome.storage.sync.set({ webAppUrl });
    const response = await chrome.runtime.sendMessage({ type: 'START_AUTH' });
    if (!response?.success) {
      showSaveMessage(
        saveMessage,
        response?.error ?? 'ログインを開始できませんでした',
        'error'
      );
    }
  });

  // 設定を保存（content scriptはstorage.onChangedで即時反映する）
  saveSettingsButton.addEventListener('click', async () => {
    const webAppUrl = webAppUrlInput.value.trim().replace(/\/+$/, '');

    if (!webAppUrl) {
      showSaveMessage(saveMessage, 'WebアプリURLを入力してください', 'error');
      return;
    }

    if (!webAppUrl.startsWith('https://') && !webAppUrl.startsWith('http://')) {
      showSaveMessage(
        saveMessage,
        'WebアプリURLは https:// で始まる必要があります',
        'error'
      );
      return;
    }

    saveSettingsButton.disabled = true;
    try {
      if (!(await ensureWebAppPermission(webAppUrl))) {
        showSaveMessage(
          saveMessage,
          'Webアプリへのアクセスを許可してください',
          'error'
        );
        saveSettingsButton.disabled = false;
        return;
      }
      const config = await fetchCometConfig(webAppUrl);
      websocketUrl = config.websocketUrl;
      historyApiUrl = config.historyApiUrl;
      authEnabled = config.authEnabled;
    } catch (error) {
      console.error('Failed to fetch connection settings:', error);
      showSaveMessage(
        saveMessage,
        '接続設定の取得に失敗しました。WebアプリURLを確認してください',
        'error'
      );
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
      showSaveMessage(
        saveMessage,
        'このWebアプリには履歴APIが設定されていません',
        'error'
      );
      saveSettingsButton.disabled = false;
      return;
    }

    const previousSettings = await loadSettings();
    if (
      previousSettings.webAppUrl &&
      previousSettings.webAppUrl !== webAppUrl
    ) {
      await chrome.storage.local.remove(['authToken', 'authTokenExpiresAt']);
    }
    await chrome.storage.sync.set({
      websocketUrl,
      roomId: roomSelect.value || GLOBAL_ROOM.id,
      speedScale: Number(speedScaleInput.value) || DEFAULT_SETTINGS.speedScale,
      fontScale: Number(fontScaleInput.value) || DEFAULT_SETTINGS.fontScale,
      commentOpacity:
        Number(commentOpacityInput.value) || DEFAULT_SETTINGS.commentOpacity,
      stampOpacity:
        Number(stampOpacityInput.value) || DEFAULT_SETTINGS.stampOpacity,
      displayArea: displayAreaSelect.value,
      qrEnabled: qrEnabledCheckbox.checked,
      webAppUrl,
      historyApiUrl,
      captureEnabled: captureEnabledCheckbox.checked,
    });
    await chrome.storage.sync.remove(['authToken', 'authTokenExpiresAt']);

    const latestSettings = await loadSettings();
    updateAuthUi(latestSettings.authToken, latestSettings.authTokenExpiresAt);
    showSaveMessage(
      saveMessage,
      authEnabled &&
        !hasValidToken(
          latestSettings.authToken,
          latestSettings.authTokenExpiresAt
        )
        ? '設定を保存しました。ログインしてください'
        : '設定を保存しました！',
      'success'
    );
    saveSettingsButton.disabled = false;
  });

  // 保存された状態を読み込む
  const localResult = await chrome.storage.local.get('commentsEnabled');
  toggleCheckbox.checked = localResult.commentsEnabled !== false; // デフォルトはtrue

  const settings = await loadSettings();
  websocketUrl = settings.websocketUrl;
  historyApiUrl = settings.historyApiUrl;
  speedScaleInput.value = String(settings.speedScale);
  fontScaleInput.value = String(settings.fontScale);
  commentOpacityInput.value = String(settings.commentOpacity);
  stampOpacityInput.value = String(settings.stampOpacity);
  displayAreaSelect.value = settings.displayArea;
  qrEnabledCheckbox.checked = settings.qrEnabled;
  captureEnabledCheckbox.checked = settings.captureEnabled;
  webAppUrlInput.value = settings.webAppUrl;
  roomSelect.innerHTML = `<option value="global">${GLOBAL_ROOM.name}</option>`;
  roomSelect.value = settings.roomId;
  updateRangeLabels();
  if (settings.webAppUrl) {
    try {
      const config = await fetchCometConfig(settings.webAppUrl);
      websocketUrl = config.websocketUrl;
      historyApiUrl = config.historyApiUrl;
      authEnabled = config.authEnabled;
      await chrome.storage.sync.set({
        historyApiUrl,
        websocketUrl: config.websocketUrl,
      });
    } catch (error) {
      console.warn('Comet popup: Failed to initialize runtime config:', error);
    }
  }
  updateAuthUi(settings.authToken, settings.authTokenExpiresAt);
  if (
    !authEnabled ||
    hasValidToken(settings.authToken, settings.authTokenExpiresAt)
  ) {
    await loadRooms(websocketUrl, settings.authToken, settings.roomId);
  }
}

main().catch((error) => {
  console.error('Comet popup: Failed to initialize:', error);
});
