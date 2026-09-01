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
  createPoll: vi.fn(),
  endPollVoting: vi.fn(),
  getConnectionParticipantKey: vi.fn(),
  getPoll: vi.fn(),
  getPollVotes: vi.fn(),
  recordPollVote: vi.fn(),
  removePoll: vi.fn(),
  savePollResults: vi.fn(),
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
  } as never;
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
    db.getPoll.mockResolvedValue(null);
    db.getPollVotes.mockResolvedValue([]);
    db.getConnectionParticipantKey.mockResolvedValue('participant-key');
    db.recordPollVote.mockResolvedValue(true);
    db.createPoll.mockResolvedValue(true);
    db.endPollVoting.mockResolvedValue(true);
    db.removePoll.mockResolvedValue(true);
    db.savePollResults.mockResolvedValue(undefined);
  });

  it('rejects malformed JSON before accessing a room', async () => {
    const result = await handler(
      { ...event(WebSocketMessageType.PING, {}), body: '{not-json' },
      {} as never,
      vi.fn()
    );

    expect(result).toEqual({ statusCode: 400 });
    expect(db.getConnectionRoom).not.toHaveBeenCalled();
  });

  it('rejects unknown message types before accessing a room', async () => {
    const result = await handler(
      {
        ...event(WebSocketMessageType.PING, {}),
        body: JSON.stringify({ type: 'future_client_message', payload: {} }),
      },
      {} as never,
      vi.fn()
    );

    expect(result).toEqual({ statusCode: 400 });
    expect(db.getConnectionRoom).not.toHaveBeenCalled();
  });

  it('stores and broadcasts comments only to the connection room', async () => {
    await handler(
      event(WebSocketMessageType.NEW_COMMENT, {
        comment: {
          content: 'hello',
          style: { color: '#FFFFFF', size: 'medium' },
        },
      }),
      {} as never,
      vi.fn()
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
    await handler(
      event(WebSocketMessageType.JOIN_ROOM, { roomId: 'expired' }),
      {} as never,
      vi.fn()
    );

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

  it('keeps broadcasting stamps while recording the last matching emoji as a vote', async () => {
    db.getPoll.mockResolvedValue({
      id: 'poll-1',
      roomId: 'room-a',
      controllerId: 'controller-1',
      title: 'Vote',
      options: [
        { id: 'option-1', emojiId: 'emoji-1f44d', emoji: '👍', label: 'Yes' },
        { id: 'option-2', emojiId: 'emoji-1f44e', emoji: '👎', label: 'No' },
      ],
      status: 'active',
      startsAt: Date.now() - 1_000,
      endsAt: Date.now() + 30_000,
    });
    db.getPollVotes.mockResolvedValue([
      { voterKey: 'voter-1', optionId: 'option-1' },
    ]);

    await handler(
      event(WebSocketMessageType.NEW_STAMP, {
        stamp: {
          id: 'stamp-1',
          stamp: {
            id: 'emoji-1f44d',
            name: '👍',
            imageUrl: '',
            category: 'emotion',
          },
          timestamp: Date.now(),
        },
      }),
      {} as never,
      vi.fn()
    );

    expect(db.saveStampEvent).toHaveBeenCalled();
    expect(db.recordPollVote).toHaveBeenCalledWith(
      'room-a',
      'poll-1',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      'option-1',
      expect.any(Number)
    );
    expect(gateway.broadcastMessage).toHaveBeenCalledWith(
      expect.anything(),
      ['connection-1'],
      expect.objectContaining({ type: WebSocketMessageType.NEW_STAMP })
    );
    expect(gateway.broadcastMessage).toHaveBeenCalledWith(
      expect.anything(),
      ['connection-1'],
      expect.objectContaining({
        type: WebSocketMessageType.POLL_STATE,
        payload: { poll: expect.objectContaining({ totalVotes: 1 }) },
      })
    );
  });

  it('treats zero-padded emoji-picker IDs and macOS scalar IDs as the same vote', async () => {
    db.getPoll.mockResolvedValue({
      id: 'poll-1',
      roomId: 'room-a',
      controllerId: 'controller-1',
      title: 'Vote',
      options: [
        {
          id: 'option-1',
          emojiId: 'emoji-0031-fe0f-20e3',
          emoji: '1️⃣',
          label: 'One',
        },
        { id: 'option-2', emojiId: 'emoji-0032-fe0f-20e3', emoji: '2️⃣', label: 'Two' },
      ],
      status: 'active',
      startsAt: Date.now() - 1_000,
      endsAt: Date.now() + 30_000,
    });

    await handler(
      event(WebSocketMessageType.NEW_STAMP, {
        stamp: {
          id: 'stamp-1',
          stamp: { id: 'emoji-31-fe0f-20e3', name: '1️⃣', imageUrl: '', category: 'emotion' },
          timestamp: Date.now(),
        },
      }),
      {} as never,
      vi.fn()
    );

    expect(db.recordPollVote).toHaveBeenCalledWith(
      'room-a',
      'poll-1',
      expect.any(String),
      'option-1',
      expect.any(Number)
    );
  });

  it('starts a room poll with validated options', async () => {
    await handler(
      event(WebSocketMessageType.POLL_START, {
        controllerId: 'controller-1',
        title: 'Choose',
        durationSeconds: 30,
        options: [
          {
            id: 'option-1',
            emojiId: 'emoji-31-fe0f-20e3',
            emoji: '1️⃣',
            label: 'One',
          },
          {
            id: 'option-2',
            emojiId: 'emoji-32-fe0f-20e3',
            emoji: '2️⃣',
            label: 'Two',
          },
        ],
      }),
      {} as never,
      vi.fn()
    );

    expect(db.createPoll).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-a',
        controllerId: 'controller-1',
        status: 'active',
      })
    );
    expect(gateway.broadcastMessage).toHaveBeenCalledWith(
      expect.anything(),
      ['connection-1'],
      expect.objectContaining({ type: WebSocketMessageType.POLL_STATE })
    );
  });

  it('ends a poll and publishes aggregate-only results', async () => {
    db.getPoll.mockResolvedValue({
      id: 'poll-1',
      roomId: 'room-a',
      controllerId: 'controller-1',
      title: 'Choose',
      options: [
        { id: 'option-1', emojiId: 'emoji-31', emoji: '1', label: 'One' },
        { id: 'option-2', emojiId: 'emoji-32', emoji: '2', label: 'Two' },
      ],
      status: 'active',
      startsAt: 1,
      endsAt: Date.now() + 10_000,
    });
    db.getPollVotes.mockResolvedValue([
      { voterKey: 'secret-a', optionId: 'option-1' },
      { voterKey: 'secret-b', optionId: 'option-1' },
      { voterKey: 'secret-c', optionId: 'option-2' },
    ]);

    await handler(
      event(WebSocketMessageType.POLL_END, {
        pollId: 'poll-1',
        controllerId: 'controller-1',
      }),
      {} as never,
      vi.fn()
    );

    expect(db.endPollVoting).toHaveBeenCalledWith(
      'room-a',
      'poll-1',
      'controller-1'
    );
    const savedResults = db.savePollResults.mock.calls[0]?.[2] as Array<{
      optionId: string;
      count: number;
      percentage: number;
    }>;
    expect(db.savePollResults).toHaveBeenCalledWith(
      'room-a',
      'poll-1',
      expect.any(Array),
      3
    );
    expect(savedResults).toMatchObject([
      { optionId: 'option-1', count: 2 },
      { optionId: 'option-2', count: 1 },
    ]);
    expect(savedResults[0]?.percentage).toBeCloseTo(200 / 3);
    expect(savedResults[1]?.percentage).toBeCloseTo(100 / 3);
    const pollState = gateway.broadcastMessage.mock.calls.find(
      (call) =>
        (call[2] as { type?: string }).type === WebSocketMessageType.POLL_STATE
    )?.[2] as { payload: { poll: { results: unknown[]; totalVotes: number } } };
    expect(pollState.payload.poll).toMatchObject({ totalVotes: 3 });
    expect(JSON.stringify(pollState)).not.toContain('secret-a');
  });
});
