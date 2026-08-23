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

