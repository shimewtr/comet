import { Comment } from './comment.js';
import { StampMessage } from './stamp.js';

/**
 * WebSocketメッセージの種類
 */
export enum WebSocketMessageType {
  NEW_COMMENT = 'new_comment',
  NEW_STAMP = 'new_stamp',
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
 * エラーメッセージ
 */
export interface ErrorPayload {
  code: string;
  message: string;
}

/**
 * WebSocket接続情報
 */
export interface ConnectionInfo {
  connectionId: string;
  userId?: string;
  connectedAt: number;
}
