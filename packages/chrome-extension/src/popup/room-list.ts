import { CometSocket, GLOBAL_ROOM, type Room, WebSocketMessageType } from '@comet/shared';

export async function loadRoomList(websocketUrl: string, authToken: string): Promise<Room[]> {
  if (!websocketUrl) return [];
  const socket = new CometSocket(websocketUrl, { tokenProvider: () => authToken || null, keepaliveIntervalMs: 0, maxReconnectAttempts: 0 });
  try {
    return await new Promise<Room[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Room list timeout')), 5000);
      socket.on(WebSocketMessageType.ROOM_LIST, ({ rooms }) => { clearTimeout(timeout); resolve(rooms); });
      void socket.connect().then(() => socket.send(WebSocketMessageType.ROOM_LIST_REQUEST, {})).catch((error) => { clearTimeout(timeout); reject(error); });
    });
  } finally { socket.disconnect(); }
}

export function populateRoomSelect(select: HTMLSelectElement, rooms: Room[], selectedRoomId: string): void {
  select.replaceChildren();
  rooms.forEach((room) => {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = `${room.name}${room.id === GLOBAL_ROOM.id ? '' : ` (${room.id.slice(0, 8)})`}`;
    select.append(option);
  });
  select.value = rooms.some((room) => room.id === selectedRoomId) ? selectedRoomId : GLOBAL_ROOM.id;
}
