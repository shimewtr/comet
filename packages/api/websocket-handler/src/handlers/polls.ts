import { createHash } from 'node:crypto';
import {
  MAX_POLL_DURATION_SECONDS,
  MAX_POLL_LABEL_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_POLL_TITLE_LENGTH,
  MIN_POLL_DURATION_SECONDS,
  MIN_POLL_OPTIONS,
  generateId,
  isRecord,
  Poll,
  PollOption,
  PollResult,
} from '@comet/shared';
import {
  createPoll,
  endPollVoting,
  getConnectionRoom,
  getConnectionParticipantKey,
  getPoll,
  getPollVotes,
  PollRecord,
  recordPollVote,
  removePoll,
  savePollResults,
} from '../dynamodb-client';
import { MessageContext } from './context';

function normalizedPollOptions(value: unknown): PollOption[] | null {
  if (
    !Array.isArray(value) ||
    value.length < MIN_POLL_OPTIONS ||
    value.length > MAX_POLL_OPTIONS
  ) {
    return null;
  }
  const options: PollOption[] = [];
  const optionIds = new Set<string>();
  const emojiIds = new Set<string>();
  for (const item of value) {
    const candidate = item as Partial<PollOption>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const emojiId =
      typeof candidate.emojiId === 'string'
        ? candidate.emojiId.trim().toLowerCase()
        : '';
    const emoji =
      typeof candidate.emoji === 'string' ? candidate.emoji.trim() : '';
    const label =
      typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (
      !id ||
      id.length > 64 ||
      !emojiId.startsWith('emoji-') ||
      emojiId.length > 128 ||
      !emoji ||
      emoji.length > 32 ||
      !label ||
      label.length > MAX_POLL_LABEL_LENGTH ||
      optionIds.has(id) ||
      emojiIds.has(emojiId)
    ) {
      return null;
    }
    optionIds.add(id);
    emojiIds.add(emojiId);
    options.push({ id, emojiId, emoji, label });
  }
  return options;
}

function normalizedEmojiId(emojiId: string): string {
  const prefix = 'emoji-';
  const value = emojiId.trim().toLowerCase();
  if (!value.startsWith(prefix)) return value;
  return `${prefix}${value
    .slice(prefix.length)
    .split('-')
    .map((scalar) => {
      const codePoint = Number.parseInt(scalar, 16);
      return Number.isFinite(codePoint) ? codePoint.toString(16) : scalar;
    })
    .join('-')}`;
}

function pollResults(
  record: PollRecord,
  votes: Array<{ optionId: string }>
): PollResult[] {
  const counts = new Map(record.options.map((option) => [option.id, 0]));
  for (const vote of votes) {
    if (counts.has(vote.optionId)) {
      counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return record.options.map((option) => {
    const count = counts.get(option.id) ?? 0;
    return {
      optionId: option.id,
      count,
      percentage: total === 0 ? 0 : (count / total) * 100,
    };
  });
}

function publicPoll(record: PollRecord, totalVotes = record.totalVotes ?? 0): Poll {
  return {
    id: record.id,
    roomId: record.roomId,
    title: record.title,
    options: record.options,
    status: record.status,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    totalVotes,
    ...(record.status === 'ended' ? { results: record.results ?? [] } : {}),
  };
}

export function createPollHandlers(context: MessageContext) {
  const finalizePoll = async (record: PollRecord): Promise<Poll | null> => {
    if (record.status === 'active') {
      const locked = await endPollVoting(
        record.roomId,
        record.id,
        record.controllerId
      );
      if (!locked) {
        const current = await getPoll(record.roomId);
        if (!current) return null;
        record = current;
        if (record.status === 'active') {
          const votes = await getPollVotes(record.id);
          return publicPoll(record, votes.length);
        }
      } else {
        record = { ...record, status: 'ended' };
      }
    }
    const votes = await getPollVotes(record.id);
    const results = pollResults(record, votes);
    const totalVotes = results.reduce((sum, result) => sum + result.count, 0);
    await savePollResults(record.roomId, record.id, results, totalVotes);
    return publicPoll({ ...record, results, totalVotes }, totalVotes);
  };

  const currentPoll = async (roomId: string): Promise<Poll | null> => {
    const record = await getPoll(roomId);
    if (!record) return null;
    if (record.status === 'active' && record.endsAt <= Date.now()) {
      return finalizePoll(record);
    }
    if (record.status === 'active') {
      const votes = await getPollVotes(record.id);
      return publicPoll(record, votes.length);
    }
    return record.results ? publicPoll(record) : finalizePoll(record);
  };

  return {
    currentPoll,
    async start(payload: unknown) {
      const roomId = await context.currentRoomForActivity();
      if (!roomId) return;
      const input = isRecord(payload) ? payload : {};
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const controllerId =
        typeof input.controllerId === 'string'
          ? input.controllerId.trim()
          : '';
      const durationSeconds = input.durationSeconds;
      const options = normalizedPollOptions(input.options);
      if (
        !controllerId ||
        controllerId.length > 128 ||
        title.length > MAX_POLL_TITLE_LENGTH ||
        typeof durationSeconds !== 'number' ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds < MIN_POLL_DURATION_SECONDS ||
        durationSeconds > MAX_POLL_DURATION_SECONDS ||
        !options
      ) {
        await context.sendError('POLL_INVALID', 'Poll settings are invalid');
        return;
      }
      const startsAt = Date.now();
      const record: PollRecord = {
        id: generateId(), roomId, controllerId, title, options, status: 'active',
        startsAt, endsAt: startsAt + durationSeconds * 1000, totalVotes: 0,
      };
      if (!(await createPoll(record))) {
        await context.sendError('POLL_ALREADY_ACTIVE', 'A poll is already active in this room');
        return;
      }
      await context.sendPollState(roomId, publicPoll(record));
    },
    async end(payload: unknown) {
      const roomId = await getConnectionRoom(context.connectionId);
      const input = isRecord(payload) ? payload : {};
      const pollId = typeof input.pollId === 'string' ? input.pollId : undefined;
      const controllerId =
        typeof input.controllerId === 'string' ? input.controllerId : undefined;
      const record = await getPoll(roomId);
      if (!record || record.id !== pollId) {
        await context.sendError('POLL_NOT_FOUND', 'Poll was not found');
        return;
      }
      if (record.controllerId !== controllerId) {
        await context.sendError('POLL_FORBIDDEN', 'Only the poll controller can end it');
        return;
      }
      await context.sendPollState(roomId, await finalizePoll(record));
    },
    async remove(payload: unknown, expectedStatus: 'active' | 'ended') {
      const roomId = await getConnectionRoom(context.connectionId);
      if (!isRecord(payload) || typeof payload.pollId !== 'string' || typeof payload.controllerId !== 'string') {
        await context.sendError('POLL_FORBIDDEN', 'Poll cannot be changed by this controller');
        return;
      }
      const removed = await removePoll(roomId, payload.pollId, payload.controllerId, expectedStatus);
      if (!removed) {
        await context.sendError('POLL_FORBIDDEN', 'Poll cannot be changed by this controller');
        return;
      }
      await context.sendPollState(roomId, null);
    },
    async recordStampVote(roomId: string, stampEmojiId: string) {
      const poll = await getPoll(roomId);
      const option = poll?.status === 'active'
        ? poll.options.find((candidate) => normalizedEmojiId(candidate.emojiId) === normalizedEmojiId(stampEmojiId))
        : undefined;
      if (!poll || !option) return;
      if (poll.endsAt <= Date.now()) {
        await context.sendPollState(roomId, await finalizePoll(poll));
        return;
      }
      const participantKey = await getConnectionParticipantKey(context.connectionId);
      if (!participantKey) return;
      const voterKey = createHash('sha256')
        .update(`${poll.id}:${participantKey}`)
        // Keep the historical key derivation stable so existing votes remain
        // associated with the same browser after this refactoring.
        .update(`${poll.id}:${participantKey}`)
        .digest('hex');
      if (await recordPollVote(roomId, poll.id, voterKey, option.id, Date.now())) {
        const votes = await getPollVotes(poll.id);
        await context.sendPollState(roomId, publicPoll(poll, votes.length));
      }
    },
  };
}
