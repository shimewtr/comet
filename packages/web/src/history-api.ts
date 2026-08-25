import type {
  PaginatedRoomEvents,
  PaginatedRoomHistories,
  RoomEvent,
  RoomHistoryDetail,
} from '@comet/shared';
import { loadRuntimeConfig } from './auth';

async function apiUrl(path: string): Promise<string> {
  const config = await loadRuntimeConfig();
  const base = config.historyApiUrl || import.meta.env.VITE_HISTORY_API_URL || '';
  if (!base) throw new Error('履歴APIが設定されていません');
  return `${base.replace(/\/$/, '')}${path}`;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(await apiUrl(path), { cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || '履歴の取得に失敗しました');
  }
  return response.json();
}

export function getHistoryRooms(cursor?: string): Promise<PaginatedRoomHistories> {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return get(`/rooms?${query}`);
}

export function getRoomHistory(roomId: string): Promise<RoomHistoryDetail> {
  return get(`/rooms/${encodeURIComponent(roomId)}`);
}

export function getRoomEvents(
  roomId: string,
  from: number,
  to: number,
  cursor?: string,
  limit = 100
): Promise<PaginatedRoomEvents> {
  const query = new URLSearchParams({
    from: String(from),
    to: String(to),
    limit: String(limit),
  });
  if (cursor) query.set('cursor', cursor);
  return get(`/rooms/${encodeURIComponent(roomId)}/events?${query}`);
}

export async function getAllRoomEvents(
  roomId: string,
  from: number,
  to: number
): Promise<RoomEvent[]> {
  const events: RoomEvent[] = [];
  let cursor: string | undefined;
  do {
    const page = await getRoomEvents(roomId, from, to, cursor, 500);
    events.push(...page.events);
    cursor = page.cursor;
  } while (cursor && events.length <= 10_000);
  if (events.length > 10_000) throw new Error('1万件を超える履歴は出力できません');
  return events;
}
