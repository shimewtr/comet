import { Comment } from './comment.js';
import { StampMessage } from './stamp.js';
import { Room } from './room.js';

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
  ROOM_LIST_REQUEST = 'room_list_request',
  ROOM_LIST = 'room_list',
  CREATE_ROOM = 'create_room',
  ROOM_CREATED = 'room_created',
  JOIN_ROOM = 'join_room',
  ROOM_JOINED = 'room_joined',
}

/**
 * WebSocketメッセージの基本構造
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
  timestamp: number;
  /** roomに属するサーバー送信メッセージで設定される */
  roomId?: string;
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

export interface RoomListPayload {
  rooms: Room[];
}

export interface CreateRoomPayload {
  name: string;
}

export interface RoomCreatedPayload {
  room: Room;
}

export interface JoinRoomPayload {
  roomId: string;
}

export interface RoomJoinedPayload {
  room: Room;
}

export type WebSocketErrorCode =
  | 'INVALID_ROOM_NAME'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'INVALID_MESSAGE';

export interface ErrorPayload {
  code: WebSocketErrorCode;
  message: string;
  fallbackRoom?: Room;
}
