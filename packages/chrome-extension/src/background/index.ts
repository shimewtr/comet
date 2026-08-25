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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'CAPTURE_VISIBLE_TAB') return false;

  if (!sender.tab?.windowId) {
    sendResponse({ success: false, error: 'Active tab is unavailable' });
    return false;
  }

  chrome.tabs.captureVisibleTab(
    sender.tab.windowId,
    { format: 'jpeg', quality: 65 },
    (dataUrl) => {
      const error = chrome.runtime.lastError;
      if (error || !dataUrl) {
        sendResponse({ success: false, error: error?.message ?? 'Capture failed' });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    }
  );
  return true;
});
