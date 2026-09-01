import { GLOBAL_ROOM_ID, type Comment } from '@comet/shared';

export const MAX_COMMENT_HISTORY = 100;

export function roomIdFromUrl(): string {
  return (
    new URL(window.location.href).searchParams.get('room') ?? GLOBAL_ROOM_ID
  );
}

export function updateRoomUrl(roomId: string): void {
  const url = new URL(window.location.href);
  if (roomId === GLOBAL_ROOM_ID) url.searchParams.delete('room');
  else url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url);
}

export function mergeCommentHistory(
  previous: Comment[],
  incoming: Comment[]
): Comment[] {
  const merged = [...previous, ...incoming].sort(
    (a, b) => b.timestamp - a.timestamp
  );
  return Array.from(new Map(merged.map((comment) => [comment.id, comment])).values()).slice(
    0,
    MAX_COMMENT_HISTORY
  );
}
