import {
  WebSocketMessageType,
  WebSocketPayload,
} from '../types/websocket.js';

/** WebSocketから受ける、まだpayloadを信用していないメッセージ。 */
export type IncomingWebSocketMessage<
  T extends WebSocketMessageType = WebSocketMessageType,
> = T extends WebSocketMessageType
  ? {
      type: T;
      payload: WebSocketPayload<T>;
      timestamp?: number;
      roomId?: string;
    }
  : never;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSONの外形とメッセージ種別だけを共通で検証する。
 * timestampは旧クライアントとの互換性のため必須にしない。payloadの詳細は
 * 各ドメインhandlerが必要なルールと一緒に検証する。
 */
export function parseIncomingWebSocketMessage(body: string): IncomingWebSocketMessage | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!isRecord(value) || typeof value.type !== 'string') return null;
    if (!Object.values(WebSocketMessageType).includes(value.type as WebSocketMessageType)) {
      return null;
    }
    return {
      type: value.type as WebSocketMessageType,
      // 外形のみを検証するため、詳細なpayload検証は受信側の責務とする。
      payload: value.payload as WebSocketPayload<WebSocketMessageType>,
      ...(typeof value.timestamp === 'number' ? { timestamp: value.timestamp } : {}),
      ...(typeof value.roomId === 'string' ? { roomId: value.roomId } : {}),
    } as IncomingWebSocketMessage;
  } catch {
    return null;
  }
}
