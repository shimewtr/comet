/** WebSocketの配信先となるroom */
export interface Room {
  id: string;
  name: string;
  createdAt: number;
  lastActiveAt: number;
  /** Unix time (ms)。global roomは期限なしのためnull */
  expiresAt: number | null;
}

export const GLOBAL_ROOM_ID = 'global';
export const GLOBAL_ROOM: Room = {
  id: GLOBAL_ROOM_ID,
  name: 'グローバル',
  createdAt: 0,
  lastActiveAt: 0,
  expiresAt: null,
};
