/**
 * Background Service Worker
 */

const AUTH_REFRESH_ALARM = 'comet-auth-refresh';

async function openAuthPage(active: boolean): Promise<void> {
  const stored = await chrome.storage.sync.get('webAppUrl');
  if (typeof stored.webAppUrl !== 'string' || !stored.webAppUrl) {
    throw new Error('Web app URL is not configured');
  }
  const authUrl = new URL('/auth/extension', stored.webAppUrl);
  authUrl.searchParams.set('extensionId', chrome.runtime.id);
  await chrome.tabs.create({ url: authUrl.toString(), active });
}

function scheduleAuthRefresh(expiresAt: number): void {
  chrome.alarms.create(AUTH_REFRESH_ALARM, {
    when: Math.max(Date.now() + 60_000, expiresAt - 60_000),
  });
}

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
  if (message?.type === 'START_AUTH') {
    void openAuthPage(true)
      .then(() => sendResponse({ success: true }))
      .catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to start authentication',
        })
      );
    return true;
  }

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
        sendResponse({
          success: false,
          error: error?.message ?? 'Capture failed',
        });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    }
  );
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTH_REFRESH_ALARM) return;
  void openAuthPage(false).catch((error) => {
    console.warn('Comet: Failed to refresh authentication ticket:', error);
  });
});

/**
 * 認証済みのComet Webから短命チケットを受け取る。
 * manifest上は任意のHTTPS originを許可するが、保存済みWebアプリと
 * 完全に同じoriginからのメッセージだけを受理する。
 */
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (message?.type !== 'COMET_AUTH_TOKEN') return false;

    void (async () => {
      try {
        const stored = await chrome.storage.sync.get('webAppUrl');
        const expectedOrigin = new URL(stored.webAppUrl).origin;
        const senderOrigin = sender.url ? new URL(sender.url).origin : '';
        if (!expectedOrigin || senderOrigin !== expectedOrigin) {
          throw new Error('Unexpected authentication origin');
        }
        if (
          typeof message.token !== 'string' ||
          message.token.length < 20 ||
          typeof message.expiresAt !== 'number' ||
          message.expiresAt <= Date.now()
        ) {
          throw new Error('Invalid authentication ticket');
        }
        await chrome.storage.local.set({
          authToken: message.token,
          authTokenExpiresAt: message.expiresAt,
        });
        scheduleAuthRefresh(message.expiresAt);
        sendResponse({ success: true });
        if (sender.tab?.id && sender.tab.active === false) {
          setTimeout(() => void chrome.tabs.remove(sender.tab!.id!), 500);
        }
      } catch (error) {
        console.error('Comet: Failed to accept authentication ticket:', error);
        sendResponse({
          success: false,
          error:
            error instanceof Error ? error.message : 'Authentication failed',
        });
      }
    })();
    return true;
  }
);
