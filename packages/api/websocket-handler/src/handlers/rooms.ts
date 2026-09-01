import {
  ErrorPayload,
  GLOBAL_ROOM,
  GLOBAL_ROOM_ID,
  RoomCreatedPayload,
  RoomJoinedPayload,
  RoomListPayload,
  WebSocketMessageType,
  isRecord,
  normalizeRoomName,
} from '@comet/shared';
import {
  getConnectionRoom,
  moveConnectionToRoom,
} from '../repositories/connections';
import { getRecentComments } from '../repositories/history';
import { createRoom, getActiveRoom, getActiveRooms, touchRoom } from '../repositories/rooms';
import { MessageContext } from './context';

export function createRoomHandlers(
  context: MessageContext,
  currentPoll: (roomId: string) => Promise<import('@comet/shared').Poll | null>
) {
  return {
    async history() {
      const roomId = await getConnectionRoom(context.connectionId);
      if (roomId !== GLOBAL_ROOM_ID && !(await getActiveRoom(roomId))) {
        await context.fallbackToGlobal();
        return;
      }
      await context.sendToRequester(
        WebSocketMessageType.HISTORY,
        { comments: await getRecentComments(roomId) },
        roomId
      );
    },
    async list() {
      await context.sendToRequester<RoomListPayload>(WebSocketMessageType.ROOM_LIST, {
        rooms: [GLOBAL_ROOM, ...(await getActiveRooms())],
      });
    },
    async create(payload: unknown) {
      const name = normalizeRoomName(isRecord(payload) ? payload.name : undefined);
      if (!name) {
        await context.sendToRequester<ErrorPayload>(WebSocketMessageType.ERROR, {
          code: 'INVALID_ROOM_NAME',
          message: 'Room name must be 1-50 characters without control characters',
        });
        return;
      }
      const room = await createRoom(name);
      await moveConnectionToRoom(context.connectionId, room.id);
      await context.sendToRequester<RoomCreatedPayload>(
        WebSocketMessageType.ROOM_CREATED,
        { room },
        room.id
      );
      await context.sendToRequester<RoomJoinedPayload>(
        WebSocketMessageType.ROOM_JOINED,
        { room },
        room.id
      );
      await context.sendToRequester(WebSocketMessageType.POLL_STATE, { poll: await currentPoll(room.id) }, room.id);
    },
    async join(payload: unknown) {
      const roomId = isRecord(payload) ? payload.roomId : undefined;
      if (roomId === GLOBAL_ROOM_ID) {
        await moveConnectionToRoom(context.connectionId, GLOBAL_ROOM_ID);
        await context.sendToRequester<RoomJoinedPayload>(
          WebSocketMessageType.ROOM_JOINED,
          { room: GLOBAL_ROOM },
          GLOBAL_ROOM_ID
        );
        await context.sendToRequester(WebSocketMessageType.POLL_STATE, { poll: await currentPoll(GLOBAL_ROOM_ID) }, GLOBAL_ROOM_ID);
        return;
      }
      if (typeof roomId !== 'string') {
        await context.sendToRequester<ErrorPayload>(WebSocketMessageType.ERROR, {
          code: 'INVALID_MESSAGE',
          message: 'roomId is required',
        });
        return;
      }
      const room = await touchRoom(roomId);
      if (!room) {
        await context.fallbackToGlobal();
        return;
      }
      await moveConnectionToRoom(context.connectionId, room.id);
      await context.sendToRequester<RoomJoinedPayload>(
        WebSocketMessageType.ROOM_JOINED,
        { room },
        room.id
      );
      await context.sendToRequester(WebSocketMessageType.POLL_STATE, { poll: await currentPoll(room.id) }, room.id);
    },
  };
}
