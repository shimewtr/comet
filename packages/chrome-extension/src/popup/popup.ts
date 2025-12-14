// DOM要素
const toggleCheckbox = document.getElementById('toggle-checkbox') as HTMLInputElement;
const websocketUrlInput = document.getElementById('websocket-url') as HTMLInputElement;
const saveSettingsButton = document.getElementById('save-settings') as HTMLButtonElement;
const saveMessage = document.getElementById('save-message') as HTMLDivElement;

let isEnabled = true;

/**
 * 表示切り替え
 */
toggleCheckbox.addEventListener('change', async () => {
  isEnabled = toggleCheckbox.checked;

  // アクティブなタブにメッセージを送信
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.id) {
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

/**
 * 設定を保存
 */
saveSettingsButton.addEventListener('click', async () => {
  const websocketUrl = websocketUrlInput.value.trim();

  if (!websocketUrl) {
    showSaveMessage('WebSocket URLを入力してください', 'error');
    return;
  }

  // URLの簡易バリデーション
  if (!websocketUrl.startsWith('wss://') && !websocketUrl.startsWith('ws://')) {
    showSaveMessage('WebSocket URLは wss:// または ws:// で始まる必要があります', 'error');
    return;
  }

  // 設定を保存
  await chrome.storage.sync.set({ websocketUrl });

  showSaveMessage('設定を保存しました！', 'success');
});


/**
 * 保存メッセージを表示
 */
function showSaveMessage(message: string, type: 'success' | 'error') {
  saveMessage.textContent = message;
  saveMessage.style.color = type === 'success' ? '#4caf50' : '#f44336';

  // 3秒後にメッセージを消す
  setTimeout(() => {
    saveMessage.textContent = '';
  }, 3000);
}

/**
 * 初期化
 */
async function initialize() {
  // 保存された状態を読み込む
  const localResult = await chrome.storage.local.get('commentsEnabled');
  isEnabled = localResult.commentsEnabled !== false; // デフォルトはtrue
  toggleCheckbox.checked = isEnabled;

  // 保存された設定を読み込む
  const syncResult = await chrome.storage.sync.get('websocketUrl');

  if (syncResult.websocketUrl) {
    websocketUrlInput.value = syncResult.websocketUrl;
  }
}

initialize();
