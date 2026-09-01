import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageContext } from './context';

const db = vi.hoisted(() => ({
  createPoll: vi.fn(),
  endPollVoting: vi.fn(),
  getConnectionParticipantKey: vi.fn(),
  getConnectionRoom: vi.fn(),
  getPoll: vi.fn(),
  getPollVotes: vi.fn(),
  getRoomConnections: vi.fn(),
  recordPollVote: vi.fn(),
  removePoll: vi.fn(),
  savePollResults: vi.fn(),
}));

vi.mock('../dynamodb-client', () => db);

let createPollHandlers: typeof import('./polls').createPollHandlers;

beforeAll(async () => {
  createPollHandlers = (await import('./polls')).createPollHandlers;
});

function context(): MessageContext {
  return {
    connectionId: 'connection-1',
    sendToRequester: vi.fn(),
    sendError: vi.fn(),
    sendPollState: vi.fn(),
    currentRoomForActivity: vi.fn().mockResolvedValue('room-a'),
    fallbackToGlobal: vi.fn(),
  };
}

const activePoll = {
  id: 'poll-1',
  roomId: 'room-a',
  controllerId: 'controller-1',
  title: 'Pick one',
  options: [
    { id: 'one', emojiId: 'emoji-31', emoji: '1️⃣', label: 'One' },
    { id: 'two', emojiId: 'emoji-32', emoji: '2️⃣', label: 'Two' },
  ],
  status: 'active' as const,
  startsAt: 1,
  endsAt: Date.now() + 60_000,
  totalVotes: 0,
};

describe('poll handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getConnectionRoom.mockResolvedValue('room-a');
    db.getPoll.mockResolvedValue(null);
    db.getPollVotes.mockResolvedValue([]);
    db.createPoll.mockResolvedValue(true);
    db.removePoll.mockResolvedValue(true);
  });

  it('rejects an invalid poll before creating storage records', async () => {
    const ctx = context();
    await createPollHandlers(ctx).start({
      controllerId: 'controller-1',
      title: 'Pick one',
      durationSeconds: 1,
      options: [],
    });

    expect(db.createPoll).not.toHaveBeenCalled();
    expect(ctx.sendError).toHaveBeenCalledWith(
      'POLL_INVALID',
      'Poll settings are invalid'
    );
  });

  it('does not let another controller end a poll', async () => {
    const ctx = context();
    db.getPoll.mockResolvedValue(activePoll);

    await createPollHandlers(ctx).end({
      pollId: activePoll.id,
      controllerId: 'different-controller',
    });

    expect(db.endPollVoting).not.toHaveBeenCalled();
    expect(ctx.sendError).toHaveBeenCalledWith(
      'POLL_FORBIDDEN',
      'Only the poll controller can end it'
    );
  });

  it('does not call DynamoDB removal with a missing control payload', async () => {
    const ctx = context();
    await createPollHandlers(ctx).remove(undefined, 'active');

    expect(db.removePoll).not.toHaveBeenCalled();
    expect(ctx.sendError).toHaveBeenCalledWith(
      'POLL_FORBIDDEN',
      'Poll cannot be changed by this controller'
    );
  });

  it('keeps the regular stamp display independent from anonymous vote storage', async () => {
    const ctx = context();
    db.getPoll.mockResolvedValue(activePoll);
    db.getConnectionParticipantKey.mockResolvedValue(null);

    await createPollHandlers(ctx).recordStampVote('room-a', 'emoji-31');

    expect(db.recordPollVote).not.toHaveBeenCalled();
    expect(ctx.sendPollState).not.toHaveBeenCalled();
  });
});
