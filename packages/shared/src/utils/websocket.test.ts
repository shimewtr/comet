import { describe, expect, it } from 'vitest';
import { WebSocketMessageType } from '../types/websocket.js';
import { parseIncomingWebSocketMessage } from './websocket.js';

describe('parseIncomingWebSocketMessage', () => {
  it('keeps payload validation in the domain handler while validating the envelope', () => {
    expect(
      parseIncomingWebSocketMessage(
        JSON.stringify({ type: WebSocketMessageType.CREATE_ROOM, payload: { name: 'Demo' } })
      )
    ).toEqual({
      type: WebSocketMessageType.CREATE_ROOM,
      payload: { name: 'Demo' },
    });
  });

  it('accepts legacy messages without a timestamp', () => {
    expect(
      parseIncomingWebSocketMessage(JSON.stringify({ type: WebSocketMessageType.PING, payload: {} }))
    ).toMatchObject({ type: WebSocketMessageType.PING });
  });

  it('keeps valid optional server metadata', () => {
    expect(
      parseIncomingWebSocketMessage(
        JSON.stringify({
          type: WebSocketMessageType.NEW_COMMENT,
          payload: {},
          timestamp: 1,
          roomId: 'room-1',
        })
      )
    ).toMatchObject({ timestamp: 1, roomId: 'room-1' });
  });

  it.each(['not-json', '[]', '{"type":"not_a_message"}', '{}'])(
    'rejects an invalid envelope: %s',
    (body) => expect(parseIncomingWebSocketMessage(body)).toBeNull()
  );
});
