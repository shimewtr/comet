import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { WebSocketMessageType, GLOBAL_ROOM_ID } from '@comet/shared';

const db = vi.hoisted(() => ({
  saveConnection: vi.fn(),
  removeConnection: vi.fn(),
  getRoomConnections: vi.fn(),
  saveComment: vi.fn(),
  saveRoomEvent: vi.fn(),
  saveStampEvent: vi.fn(),
  getRecentComments: vi.fn(),
  getConnectionRoom: vi.fn(),
  moveConnectionToRoom: vi.fn(),
  getActiveRooms: vi.fn(),
  createRoom: vi.fn(),
  touchRoom: vi.fn(),
  getActiveRoom: vi.fn(),
}));
const gateway = vi.hoisted(() => ({
  createApiGatewayClient: vi.fn(() => ({})),
  broadcastMessage: vi.fn(
    async (_client: unknown, _ids: string[], _data: unknown) => ({
      sent: 1,
      failed: 0,
    })
  ),
  sendMessageToConnection: vi.fn(
    async (_client: unknown, _id: string, _data: Uint8Array) => true
  ),
}));

vi.mock('./dynamodb-client', () => db);
vi.mock('./api-gateway-client', () => gateway);
process.env.HANDLER_TYPE = 'message';
let handler: APIGatewayProxyWebsocketHandlerV2;

beforeAll(async () => {
  handler = (await import('./index')).handler;
});

function event(type: WebSocketMessageType, payload: unknown) {
  return {
    requestContext: {
      connectionId: 'connection-1',
      domainName: 'example.test',
      stage: 'prod',
    },
    body: JSON.stringify({ type, payload, timestamp: Date.now() }),
  };
}

describe('websocket room isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getConnectionRoom.mockResolvedValue('room-a');
    db.touchRoom.mockResolvedValue({
      id: 'room-a',
      name: 'A',
      createdAt: 1,
      lastActiveAt: 2,
      expiresAt: Date.now() + 1000,
    });
    db.getRoomConnections.mockResolvedValue(['connection-1']);
    db.saveComment.mockResolvedValue(undefined);
    db.saveRoomEvent.mockResolvedValue(undefined);
    db.saveStampEvent.mockResolvedValue(undefined);
  });

  it('stores and broadcasts comments only to the connection room', async () => {
    await handler(
      event(WebSocketMessageType.NEW_COMMENT, {
        comment: {
          content: 'hello',
          style: { color: '#FFFFFF', size: 'medium' },
        },
      })
    );

    expect(db.saveComment).toHaveBeenCalledWith(
      'room-a',
      expect.objectContaining({ content: 'hello' })
    );
    expect(db.saveRoomEvent).toHaveBeenCalledWith(
      'room-a',
      expect.objectContaining({ type: 'comment' })
    );
    expect(db.getRoomConnections).toHaveBeenCalledWith('room-a');
    expect(gateway.broadcastMessage).toHaveBeenCalledWith(
      expect.anything(),
      ['connection-1'],
      expect.objectContaining({ roomId: 'room-a' })
    );
  });

  it('falls back to global when joining an expired room', async () => {
    db.touchRoom.mockResolvedValue(null);
    await handler(event(WebSocketMessageType.JOIN_ROOM, { roomId: 'expired' }));

    expect(db.moveConnectionToRoom).toHaveBeenCalledWith(
      'connection-1',
      GLOBAL_ROOM_ID
    );
    const encoded = gateway.sendMessageToConnection.mock.calls[0][2] as Buffer;
    expect(JSON.parse(encoded.toString())).toMatchObject({
      type: WebSocketMessageType.ERROR,
      payload: { code: 'ROOM_EXPIRED', fallbackRoom: { id: GLOBAL_ROOM_ID } },
    });
  });
});
