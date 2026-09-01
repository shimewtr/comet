import type { Room, RoomEvent, RoomHistorySummary } from '@comet/shared';

export interface RoomRecord extends Room {
  commentCount?: number;
  stampCount?: number;
  recorderId?: string;
  recorderExpiresAt?: number;
}

export function toRoom(value: RoomRecord): Room {
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    lastActiveAt: value.lastActiveAt,
    expiresAt: value.expiresAt,
  };
}

export function toSummary(value: RoomRecord): RoomHistorySummary {
  const commentCount = value.commentCount ?? 0;
  const stampCount = value.stampCount ?? 0;
  return {
    room: toRoom(value),
    status: value.expiresAt > Date.now() ? 'active' : 'archived',
    commentCount,
    stampCount,
    totalCount: commentCount + stampCount,
  };
}

export function toEvent(value: RoomEvent): RoomEvent {
  return value.type === 'comment'
    ? { type: 'comment', timestamp: value.timestamp, comment: value.comment }
    : { type: 'stamp', timestamp: value.timestamp, stamp: value.stamp };
}
