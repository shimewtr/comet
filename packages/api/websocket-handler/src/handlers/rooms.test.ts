import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLOBAL_ROOM_ID, WebSocketMessageType } from '@comet/shared';
import { MessageContext } from './context';

const db = vi.hoisted(() => ({
  createRoom: vi.fn(),
  getActiveRoom: vi.fn(),
  getActiveRooms: vi.fn(),
  getConnectionRoom: vi.fn(),
  getRecentComments: vi.fn(),
  moveConnectionToRoom: vi.fn(),
  touchRoom: vi.fn(),
}));

vi.mock('../repositories/connections', () => ({
  getConnectionRoom: db.getConnectionRoom,
  moveConnectionToRoom: db.moveConnectionToRoom,
}));
vi.mock('../repositories/history', () => ({ getRecentComments: db.getRecentComments }));
vi.mock('../repositories/rooms', () => ({
  createRoom: db.createRoom,
  getActiveRoom: db.getActiveRoom,
  getActiveRooms: db.getActiveRooms,
  touchRoom: db.touchRoom,
}));

let createRoomHandlers: typeof import('./rooms').createRoomHandlers;

beforeAll(async () => {
  createRoomHandlers = (await import('./rooms')).createRoomHandlers;
});

function context(): MessageContext {
  return {
    connectionId: 'connection-1',
    sendToRequester: vi.fn(),
    sendError: vi.fn(),
    sendPollState: vi.fn(),
    currentRoomForActivity: vi.fn(),
    fallbackToGlobal: vi.fn(),
  };
}

describe('room handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an invalid room name without creating a room', async () => {
    const ctx = context();
    const rooms = createRoomHandlers(ctx, vi.fn());

    await rooms.create({ name: '  ' });

    expect(db.createRoom).not.toHaveBeenCalled();
    expect(ctx.sendToRequester).toHaveBeenCalledWith(
      WebSocketMessageType.ERROR,
      expect.objectContaining({ code: 'INVALID_ROOM_NAME' })
    );
  });

  it('moves a connection to global and sends its current poll state', async () => {
    const ctx = context();
    const currentPoll = vi.fn().mockResolvedValue(null);
    const rooms = createRoomHandlers(ctx, currentPoll);

    await rooms.join({ roomId: GLOBAL_ROOM_ID });

    expect(db.moveConnectionToRoom).toHaveBeenCalledWith(
      'connection-1',
      GLOBAL_ROOM_ID
    );
    expect(currentPoll).toHaveBeenCalledWith(GLOBAL_ROOM_ID);
    expect(ctx.sendToRequester).toHaveBeenCalledWith(
      WebSocketMessageType.ROOM_JOINED,
      expect.objectContaining({ room: expect.objectContaining({ id: GLOBAL_ROOM_ID }) }),
      GLOBAL_ROOM_ID
    );
    expect(ctx.sendToRequester).toHaveBeenCalledWith(
      WebSocketMessageType.POLL_STATE,
      { poll: null },
      GLOBAL_ROOM_ID
    );
  });

  it('falls back instead of joining an expired room', async () => {
    const ctx = context();
    db.touchRoom.mockResolvedValue(null);

    await createRoomHandlers(ctx, vi.fn()).join({ roomId: 'expired' });

    expect(ctx.fallbackToGlobal).toHaveBeenCalledOnce();
    expect(db.moveConnectionToRoom).not.toHaveBeenCalled();
  });
});
