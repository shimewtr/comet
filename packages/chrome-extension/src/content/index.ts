import {
  WebSocketMessageType,
  NewCommentPayload,
  NewStampPayload,
} from '@comet/shared';
import { WebSocketClient } from './websocket-client';
import { CommentRenderer } from './comment-renderer';
import { StampRenderer } from './stamp-renderer';

let wsClient: WebSocketClient | null = null;
let commentRenderer: CommentRenderer | null = null;
let stampRenderer: StampRenderer | null = null;

/**
 * 初期化
 */
async function initialize() {
  console.log('Comet: Initializing...');

  // 設定を読み込む
  const result = await chrome.storage.sync.get('websocketUrl');
  const websocketUrl = result.websocketUrl;

  if (!websocketUrl) {
    console.error('Comet: WebSocket URL is not configured. Please set it in the extension popup.');
    return;
  }

  // レンダラーを初期化
  commentRenderer = new CommentRenderer();
  stampRenderer = new StampRenderer();

  // 保存された表示状態を復元
  const localResult = await chrome.storage.local.get('commentsEnabled');
  const isEnabled = localResult.commentsEnabled !== false; // デフォルトはtrue
  if (!isEnabled) {
    commentRenderer.disable();
    stampRenderer.disable();
  }

  // WebSocket接続を初期化
  try {
    wsClient = new WebSocketClient(websocketUrl);
    await wsClient.connect();

    // 新規コメント受信ハンドラー
    wsClient.on(
      WebSocketMessageType.NEW_COMMENT,
      (payload: NewCommentPayload) => {
        if (commentRenderer) {
          commentRenderer.renderComment(payload.comment);
        }
      }
    );

    // 新規スタンプ受信ハンドラー
    wsClient.on(WebSocketMessageType.NEW_STAMP, (payload: NewStampPayload) => {
      if (stampRenderer) {
        stampRenderer.renderStamp(payload.stamp);
      }
    });

    console.log('Comet: Connected to WebSocket');
  } catch (error) {
    console.error('Comet: Failed to connect to WebSocket:', error);
  }
}

/**
 * クリーンアップ
 */
function cleanup() {
  if (wsClient) {
    wsClient.disconnect();
  }

  if (commentRenderer) {
    commentRenderer.destroy();
  }

  if (stampRenderer) {
    stampRenderer.destroy();
  }
}

/**
 * Chrome拡張からのメッセージハンドラー
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
initialize();
