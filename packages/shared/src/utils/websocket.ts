import { WebSocketMessageType } from '../types/websocket.js';

/** WebSocketから受ける、まだpayloadを信用していないメッセージ。 */
export interface IncomingWebSocketMessage {
  type: WebSocketMessageType;
  payload: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSONの外形とメッセージ種別だけを共通で検証する。
 * timestampは旧クライアントとの互換性のため必須にしない。payloadの詳細は
 * 各ドメインhandlerが必要なルールと一緒に検証する。
 */
export function parseIncomingWebSocketMessage(
  body: string
): IncomingWebSocketMessage | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!isRecord(value) || typeof value.type !== 'string') return null;
    if (!Object.values(WebSocketMessageType).includes(value.type as WebSocketMessageType)) {
      return null;
    }
    return { type: value.type as WebSocketMessageType, payload: value.payload };
  } catch {
    return null;
  }
}
