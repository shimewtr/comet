/**
 * Background Service Worker
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Comet: Extension installed');

    // 初期設定
    chrome.storage.sync.set({
      enabled: true,
      websocketUrl: '',
    });
  } else if (details.reason === 'update') {
    console.log('Comet: Extension updated');
  }
});

/**
 * メッセージハンドラー
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  switch (message.type) {
    case 'GET_CONFIG':
      chrome.storage.sync.get(['enabled', 'websocketUrl'], (config) => {
        sendResponse(config);
      });
      return true; // 非同期レスポンス

    case 'SET_CONFIG':
      chrome.storage.sync.set(message.config, () => {
        sendResponse({ success: true });
      });
      return true; // 非同期レスポンス

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});
