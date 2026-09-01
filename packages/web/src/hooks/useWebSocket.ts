import { useCallback, useRef, useState } from 'react';
import {
  type Comment,
  type Stamp,
  type StampMessage,
  CometSocket,
  generateId,
  WebSocketMessageType,
} from '@comet/shared';
import { useCommentHistory } from './useCommentHistory';
import { useRoomSession } from './useRoomSession';
import { useWebSocketConnection } from './useWebSocketConnection';

export function useWebSocket() {
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<CometSocket | null>(null);
  const joinedRoomIdRef = useRef<string | null>(null);
  const history = useCommentHistory(joinedRoomIdRef);
  const room = useRoomSession({
    socketRef,
    joinedRoomIdRef,
    clearCommentHistory: history.clearCommentHistory,
    setError,
  });

  const subscribe = useCallback(
    (socket: CometSocket) => [
      socket.on(WebSocketMessageType.NEW_COMMENT, history.handleNewComment),
      socket.on(WebSocketMessageType.HISTORY, history.handleHistory),
      socket.on(WebSocketMessageType.ROOM_LIST, ({ rooms }) => room.setRooms(rooms)),
      socket.on(WebSocketMessageType.ROOM_CREATED, room.handleRoomCreated),
      socket.on(WebSocketMessageType.ROOM_JOINED, ({ room: joinedRoom }) =>
        room.acceptRoom(joinedRoom)
      ),
      socket.on(WebSocketMessageType.ERROR, room.handleRoomError),
    ],
    [history.handleHistory, history.handleNewComment, room]
  );

  const connection = useWebSocketConnection({
    socketRef,
    setError,
    onOpen: room.handleConnected,
    onFailed: () => setError('Failed to connect after multiple attempts'),
    subscribe,
  });

  const sendComment = useCallback(
    async (comment: Omit<Comment, 'id' | 'timestamp'>) => {
      if (!socketRef.current || room.isJoiningRoom) return false;
      return socketRef.current.sendWhenOpen(WebSocketMessageType.NEW_COMMENT, {
        comment: { ...comment, id: generateId(), timestamp: Date.now() },
      });
    },
    [room.isJoiningRoom]
  );

  const sendStamp = useCallback(
    async (stamp: Stamp, position?: { x: number; y: number }) => {
      if (!socketRef.current || room.isJoiningRoom) return false;
      const stampMessage: StampMessage = {
        id: generateId(), stamp, timestamp: Date.now(), position,
      };
      return socketRef.current.sendWhenOpen(WebSocketMessageType.NEW_STAMP, {
        stamp: stampMessage,
      });
    },
    [room.isJoiningRoom]
  );

  return {
    isConnected: connection.isConnected,
    isJoiningRoom: room.isJoiningRoom,
    error,
    commentHistory: history.commentHistory,
    rooms: room.rooms,
    currentRoom: room.currentRoom,
    joinRoom: room.joinRoom,
    createRoom: room.createRoom,
    refreshRooms: room.refreshRooms,
    sendComment,
    sendStamp,
    reconnect: () => socketRef.current?.reconnectNow(),
  };
}
