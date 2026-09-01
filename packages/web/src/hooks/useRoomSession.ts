import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import {
  type CometSocket,
  type ErrorPayload,
  type Room,
  WebSocketMessageType,
  GLOBAL_ROOM,
} from '@comet/shared';
import { roomIdFromUrl, updateRoomUrl } from './websocket-session-utils';

interface UseRoomSessionOptions {
  socketRef: MutableRefObject<CometSocket | null>;
  joinedRoomIdRef: MutableRefObject<string | null>;
  clearCommentHistory: () => void;
  setError: (error: string | null) => void;
}

export function useRoomSession({
  socketRef,
  joinedRoomIdRef,
  clearCommentHistory,
  setError,
}: UseRoomSessionOptions) {
  const [isJoiningRoom, setIsJoiningRoom] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([GLOBAL_ROOM]);
  const [currentRoom, setCurrentRoom] = useState<Room>(GLOBAL_ROOM);
  const requestedRoomIdRef = useRef(roomIdFromUrl());

  const requestHistory = useCallback(() => {
    socketRef.current?.send(WebSocketMessageType.HISTORY_REQUEST, {});
  }, [socketRef]);

  const acceptRoom = useCallback(
    (room: Room, clearError = true) => {
      joinedRoomIdRef.current = room.id;
      requestedRoomIdRef.current = room.id;
      setCurrentRoom(room);
      clearCommentHistory();
      setIsJoiningRoom(false);
      if (clearError) setError(null);
      updateRoomUrl(room.id);
      requestHistory();
    },
    [clearCommentHistory, joinedRoomIdRef, requestHistory, setError]
  );

  const handleConnected = useCallback(() => {
    setError(null);
    setIsJoiningRoom(true);
    joinedRoomIdRef.current = null;
    socketRef.current?.send(WebSocketMessageType.ROOM_LIST_REQUEST, {});
    socketRef.current?.send(WebSocketMessageType.JOIN_ROOM, {
      roomId: requestedRoomIdRef.current,
    });
  }, [joinedRoomIdRef, setError, socketRef]);

  const handleRoomCreated = useCallback(({ room }: { room: Room }) => {
    setRooms((previous) => [
      previous[0] ?? GLOBAL_ROOM,
      room,
      ...previous.slice(1).filter((candidate) => candidate.id !== room.id),
    ]);
  }, []);

  const handleRoomError = useCallback(
    (payload: ErrorPayload) => {
      setError(payload.message);
      if (payload.fallbackRoom) acceptRoom(payload.fallbackRoom, false);
      else setIsJoiningRoom(false);
    },
    [acceptRoom, setError]
  );

  const joinRoom = useCallback(async (roomId: string) => {
    if (!socketRef.current) return false;
    requestedRoomIdRef.current = roomId;
    joinedRoomIdRef.current = null;
    setIsJoiningRoom(true);
    clearCommentHistory();
    return socketRef.current.sendWhenOpen(WebSocketMessageType.JOIN_ROOM, { roomId });
  }, [clearCommentHistory, joinedRoomIdRef, socketRef]);

  const createRoom = useCallback(async (name: string) => {
    if (!socketRef.current) return false;
    setIsJoiningRoom(true);
    return socketRef.current.sendWhenOpen(WebSocketMessageType.CREATE_ROOM, { name });
  }, [socketRef]);

  const refreshRooms = useCallback(
    () => socketRef.current?.send(WebSocketMessageType.ROOM_LIST_REQUEST, {}) ?? false,
    [socketRef]
  );

  return {
    isJoiningRoom, rooms, currentRoom, joinedRoomIdRef, handleConnected,
    setRooms, handleRoomCreated, acceptRoom, handleRoomError, joinRoom, createRoom, refreshRooms,
  };
}
