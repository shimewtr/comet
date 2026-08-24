import { DEFAULT_SETTINGS, loadSettings } from '../settings';

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
  saveMessage.style.color = type === 'success' ? '#4caf50' : '#f44336';

  // 3秒後にメッセージを消す
  setTimeout(() => {
    saveMessage.textContent = '';
  }, 3000);
}

async function main() {
  const toggleCheckbox = getElement<HTMLInputElement>('toggle-checkbox');
  const websocketUrlInput = getElement<HTMLInputElement>('websocket-url');
  const speedScaleInput = getElement<HTMLInputElement>('speed-scale');
  const speedScaleValue = getElement<HTMLSpanElement>('speed-scale-value');
  const fontScaleInput = getElement<HTMLInputElement>('font-scale');
  const fontScaleValue = getElement<HTMLSpanElement>('font-scale-value');
  const displayAreaSelect = getElement<HTMLSelectElement>('display-area');
  const qrEnabledCheckbox = getElement<HTMLInputElement>('qr-enabled');
  const webAppUrlInput = getElement<HTMLInputElement>('web-app-url');
  const fetchConfigButton = getElement<HTMLButtonElement>('fetch-config');
  const saveSettingsButton = getElement<HTMLButtonElement>('save-settings');
  const saveMessage = getElement<HTMLDivElement>('save-message');

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
      const response = await fetch(`${webAppUrl}/comet-config.json`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const config = await response.json();
      if (
        typeof config.websocketUrl !== 'string' ||
        (!config.websocketUrl.startsWith('wss://') &&
          !config.websocketUrl.startsWith('ws://'))
      ) {
        throw new Error('Invalid config');
      }

      websocketUrlInput.value = config.websocketUrl;
      showSaveMessage(
        saveMessage,
        'WebSocket URLを取得しました。「保存」で確定してください',
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

  // 設定を保存（content scriptはstorage.onChangedで即時反映する）
  saveSettingsButton.addEventListener('click', async () => {
    const websocketUrl = websocketUrlInput.value.trim();
    const webAppUrl = webAppUrlInput.value.trim();

    if (
      websocketUrl &&
      !websocketUrl.startsWith('wss://') &&
      !websocketUrl.startsWith('ws://')
    ) {
      showSaveMessage(
        saveMessage,
        'WebSocket URLは wss:// または ws:// で始まる必要があります',
        'error'
      );
      return;
    }

    if (
      webAppUrl &&
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

    if (qrEnabledCheckbox.checked && !webAppUrl) {
      showSaveMessage(
        saveMessage,
        'QRコードを表示するにはWebアプリURLを入力してください',
        'error'
      );
      return;
    }

    await chrome.storage.sync.set({
      websocketUrl,
      speedScale: Number(speedScaleInput.value) || DEFAULT_SETTINGS.speedScale,
      fontScale: Number(fontScaleInput.value) || DEFAULT_SETTINGS.fontScale,
      displayArea: displayAreaSelect.value,
      qrEnabled: qrEnabledCheckbox.checked,
      webAppUrl,
    });

    showSaveMessage(saveMessage, '設定を保存しました！', 'success');
  });

  // 保存された状態を読み込む
  const localResult = await chrome.storage.local.get('commentsEnabled');
  toggleCheckbox.checked = localResult.commentsEnabled !== false; // デフォルトはtrue

  const settings = await loadSettings();
  websocketUrlInput.value = settings.websocketUrl;
  speedScaleInput.value = String(settings.speedScale);
  fontScaleInput.value = String(settings.fontScale);
  displayAreaSelect.value = settings.displayArea;
  qrEnabledCheckbox.checked = settings.qrEnabled;
  webAppUrlInput.value = settings.webAppUrl;
  updateScaleLabels();
}

main().catch((error) => {
  console.error('Comet popup: Failed to initialize:', error);
});
