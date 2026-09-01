import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { marshall } from '@aws-sdk/util-dynamodb';

const dynamo = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('./client', () => ({
  client: dynamo,
  tables: {
    rooms: 'rooms',
  },
}));

let getActiveRoom: typeof import('./rooms').getActiveRoom;

beforeAll(async () => {
  getActiveRoom = (await import('./rooms')).getActiveRoom;
});

describe('room repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not treat an expired room record as active', async () => {
    dynamo.send.mockResolvedValue({
      Item: marshall({
        id: 'expired-room',
        name: 'Expired',
        createdAt: 1,
        lastActiveAt: 2,
        expiresAt: Date.now() - 1,
      }),
    });

    await expect(getActiveRoom('expired-room')).resolves.toBeNull();
  });

  it('returns an active room record without extending its expiry', async () => {
    const expiresAt = Date.now() + 60_000;
    dynamo.send.mockResolvedValue({
      Item: marshall({
        id: 'room-1',
        name: 'Demo',
        createdAt: 1,
        lastActiveAt: 2,
        expiresAt,
      }),
    });

    await expect(getActiveRoom('room-1')).resolves.toEqual({
      id: 'room-1',
      name: 'Demo',
      createdAt: 1,
      lastActiveAt: 2,
      expiresAt,
    });
  });
});
