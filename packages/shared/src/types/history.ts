import type { Comment } from './comment.js';
import type { Room } from './room.js';
import type { StampMessage } from './stamp.js';

export type RoomEvent =
  | { type: 'comment'; timestamp: number; comment: Comment }
  | { type: 'stamp'; timestamp: number; stamp: StampMessage };

export interface PopularStamp {
  stamp: StampMessage['stamp'];
  count: number;
}

export type PopularHistoryItem =
  | { type: 'comment'; content: string; count: number }
  | { type: 'stamp'; stamp: StampMessage['stamp']; count: number };

export interface HistoryBucket {
  start: number;
  end: number;
  totalCount: number;
  commentCount: number;
  stampCount: number;
  popularStamps: PopularStamp[];
  popularItems: PopularHistoryItem[];
  sampleComments: Comment[];
}

export interface RoomHistorySummary {
  room: Room;
  status: 'active' | 'archived';
  commentCount: number;
  stampCount: number;
  totalCount: number;
}

export interface RoomHistoryDetail extends RoomHistorySummary {
  from: number;
  to: number;
  bucketSizeMs: number;
  buckets: HistoryBucket[];
  metrics: RoomHistoryMetrics;
  peaks: HistoryPeak[];
  captures: HistoryCapture[];
}

export interface HistoryCapture {
  capturedAt: number;
  imageUrl: string;
}

export interface RoomHistoryMetrics {
  durationMs: number;
  maxPostsPerMinute: number;
  peakAt: number | null;
  topStamp: PopularStamp | null;
  commentRatio: number;
}

export interface HistoryPeak {
  start: number;
  end: number;
  totalCount: number;
  commentCount: number;
  stampCount: number;
  popularStamps: PopularStamp[];
  popularItems: PopularHistoryItem[];
  sampleComments: Comment[];
  capture?: HistoryCapture;
}

export interface PaginatedRoomHistories {
  rooms: RoomHistorySummary[];
  cursor?: string;
}

export interface PaginatedRoomEvents {
  events: RoomEvent[];
  cursor?: string;
}
