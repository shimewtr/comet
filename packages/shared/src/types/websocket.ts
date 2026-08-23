import { Comment } from './comment.js';
import { StampMessage } from './stamp.js';

/**
 * WebSocketメッセージの種類
 */
export enum WebSocketMessageType {
  NEW_COMMENT = 'new_comment',
  NEW_STAMP = 'new_stamp',
  HISTORY_REQUEST = 'history_request',
  HISTORY = 'history',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong',
}

/**
 * WebSocketメッセージの基本構造
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
  timestamp: number;
}


/**
 * 新規コメントメッセージ
 */
export interface NewCommentPayload {
  comment: Comment;
}

/**
 * 新規スタンプメッセージ
 */
export interface NewStampPayload {
  stamp: StampMessage;
}

/**
 * コメント履歴リクエスト（クライアント→サーバ）
 */
export interface HistoryRequestPayload {
  limit?: number;
}

/**
 * コメント履歴レスポンス（サーバ→リクエストした接続のみ）
 * commentsは古い順
 */
export interface HistoryPayload {
  comments: Comment[];
}
