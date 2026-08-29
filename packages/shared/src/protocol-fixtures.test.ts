import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ErrorPayload,
  NewCommentPayload,
  NewStampPayload,
  RoomJoinedPayload,
  RoomListPayload,
  WebSocketMessage,
  WebSocketMessageType,
} from './types/index.js';

interface ProtocolFixtures {
  comment: WebSocketMessage<NewCommentPayload>;
  stamp: WebSocketMessage<NewStampPayload>;
  roomList: WebSocketMessage<RoomListPayload>;
  roomJoined: WebSocketMessage<RoomJoinedPayload>;
  error: WebSocketMessage<ErrorPayload>;
}

const fixturePath = fileURLToPath(
  new URL('../fixtures/websocket-events.json', import.meta.url)
);
const fixtures = JSON.parse(
  readFileSync(fixturePath, 'utf8')
) as ProtocolFixtures;

describe('WebSocket protocol fixtures', () => {
  it('covers the comment and stamp payloads used by renderers', () => {
    expect(fixtures.comment.type).toBe(WebSocketMessageType.NEW_COMMENT);
    expect(fixtures.comment.payload.comment).toMatchObject({
      id: 'comment-1',
      style: { size: 'large', animation: 'bounce', speed: 5 },
    });

    expect(fixtures.stamp.type).toBe(WebSocketMessageType.NEW_STAMP);
    expect(fixtures.stamp.payload.stamp).toMatchObject({
      id: 'stamp-message-1',
      stamp: { id: 'stamp-1', category: 'reaction' },
      position: { x: 0.25, y: 0.75 },
    });
  });

  it('covers room selection and fallback payloads', () => {
    expect(fixtures.roomList.type).toBe(WebSocketMessageType.ROOM_LIST);
    expect(fixtures.roomList.payload.rooms.map(({ id }) => id)).toEqual([
      'global',
      'room-1',
    ]);

    expect(fixtures.roomJoined.type).toBe(WebSocketMessageType.ROOM_JOINED);
    expect(fixtures.roomJoined.payload.room.id).toBe('room-1');
    expect(fixtures.error.type).toBe(WebSocketMessageType.ERROR);
    expect(fixtures.error.payload.fallbackRoom?.id).toBe('global');
  });
});
