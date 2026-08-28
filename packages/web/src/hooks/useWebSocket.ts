import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  NewCommentPayload,
  HistoryPayload,
  Comment,
  Stamp,
  StampMessage,
  Room,
  RoomListPayload,
  RoomCreatedPayload,
  RoomJoinedPayload,
  ErrorPayload,
} from '@comet/shared';
import {
  WebSocketMessageType,
  CometSocket,
  generateId,
  GLOBAL_ROOM,
  GLOBAL_ROOM_ID,
} from '@comet/shared';
import { getAuthToken, loadRuntimeConfig } from '../auth';

const MAX_COMMENT_HISTORY = 100;

function roomIdFromUrl(): string {
  return (
    new URL(window.location.href).searchParams.get('room') || GLOBAL_ROOM_ID
  );
}

function updateRoomUrl(roomId: string): void {
  const url = new URL(window.location.href);
  if (roomId === GLOBAL_ROOM_ID) url.searchParams.delete('room');
  else url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url);
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentHistory, setCommentHistory] = useState<Comment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([GLOBAL_ROOM]);
  const [currentRoom, setCurrentRoom] = useState<Room>(GLOBAL_ROOM);
  const [websocketUrl, setWebsocketUrl] = useState<string | null>(null);
  const socketRef = useRef<CometSocket | null>(null);
  const joinedRoomIdRef = useRef<string | null>(null);
  const requestedRoomIdRef = useRef(roomIdFromUrl());

  useEffect(() => {
    let active = true;
    loadRuntimeConfig().then((config) => {
      if (active) {
        setWebsocketUrl(
          config.websocketUrl || import.meta.env.VITE_WEBSOCKET_URL || ''
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (websocketUrl === null) return;
    if (!websocketUrl) {
      setError('WebSocket URL is not configured');
      return;
    }

    const socket = new CometSocket(websocketUrl, {
      tokenProvider: getAuthToken,
      onStatusChange: (status) => {
        setIsConnected(status === 'open');
        if (status === 'open') {
          setError(null);
          setIsJoiningRoom(true);
          joinedRoomIdRef.current = null;
          socket.send(WebSocketMessageType.ROOM_LIST_REQUEST, {});
          socket.send(WebSocketMessageType.JOIN_ROOM, {
            roomId: requestedRoomIdRef.current,
          });
        } else if (status === 'failed') {
          setError('Failed to connect after multiple attempts');
        }
      },
    });

    const mergeIntoHistory = (prev: Comment[], incoming: Comment[]) => {
      const merged = [...prev, ...incoming].sort(
        (a, b) => b.timestamp - a.timestamp
      );
      return Array.from(new Map(merged.map((c) => [c.id, c])).values()).slice(
        0,
        MAX_COMMENT_HISTORY
      );
    };

    const unsubscribers = [
      socket.on<NewCommentPayload>(
        WebSocketMessageType.NEW_COMMENT,
        (payload, message) => {
          if (
            !joinedRoomIdRef.current ||
            message.roomId !== joinedRoomIdRef.current
          )
            return;
          setCommentHistory((prev) =>
            mergeIntoHistory(prev, [payload.comment])
          );
        }
      ),
      socket.on<HistoryPayload>(
        WebSocketMessageType.HISTORY,
        (payload, message) => {
          if (
            !joinedRoomIdRef.current ||
            message.roomId !== joinedRoomIdRef.current
          )
            return;
          setCommentHistory((prev) => mergeIntoHistory(prev, payload.comments));
        }
      ),
      socket.on<RoomListPayload>(WebSocketMessageType.ROOM_LIST, ({ rooms }) =>
        setRooms(rooms)
      ),
      socket.on<RoomCreatedPayload>(
        WebSocketMessageType.ROOM_CREATED,
        ({ room }) => {
          setRooms((prev) => [
            prev[0] ?? GLOBAL_ROOM,
            room,
            ...prev.slice(1).filter((r) => r.id !== room.id),
          ]);
        }
      ),
      socket.on<RoomJoinedPayload>(
        WebSocketMessageType.ROOM_JOINED,
        ({ room }) => {
          joinedRoomIdRef.current = room.id;
          requestedRoomIdRef.current = room.id;
          setCurrentRoom(room);
          setCommentHistory([]);
          setIsJoiningRoom(false);
          setError(null);
          updateRoomUrl(room.id);
          socket.send(WebSocketMessageType.HISTORY_REQUEST, {});
        }
      ),
      socket.on<ErrorPayload>(WebSocketMessageType.ERROR, (payload) => {
        setError(payload.message);
        if (payload.fallbackRoom) {
          const room = payload.fallbackRoom;
          joinedRoomIdRef.current = room.id;
          requestedRoomIdRef.current = room.id;
          setCurrentRoom(room);
          setCommentHistory([]);
          setIsJoiningRoom(false);
          updateRoomUrl(room.id);
          socket.send(WebSocketMessageType.HISTORY_REQUEST, {});
        } else {
          setIsJoiningRoom(false);
        }
      }),
    ];

    socket
      .connect()
      .catch((err) => console.error('Failed to connect WebSocket:', err));
    socketRef.current = socket;

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      socket.disconnect();
      socketRef.current = null;
    };
  }, [websocketUrl]);

  const joinRoom = useCallback(async (roomId: string) => {
    const socket = socketRef.current;
    if (!socket) return false;
    requestedRoomIdRef.current = roomId;
    joinedRoomIdRef.current = null;
    setIsJoiningRoom(true);
    setCommentHistory([]);
    return socket.sendWhenOpen(WebSocketMessageType.JOIN_ROOM, { roomId });
  }, []);

  const createRoom = useCallback(async (name: string) => {
    const socket = socketRef.current;
    if (!socket) return false;
    setIsJoiningRoom(true);
    return socket.sendWhenOpen(WebSocketMessageType.CREATE_ROOM, { name });
  }, []);

  const refreshRooms = useCallback(
    () =>
      socketRef.current?.send(WebSocketMessageType.ROOM_LIST_REQUEST, {}) ??
      false,
    []
  );

  const sendComment = useCallback(
    async (comment: Omit<Comment, 'id' | 'timestamp'>) => {
      const socket = socketRef.current;
      if (!socket || isJoiningRoom) return false;
      return socket.sendWhenOpen(WebSocketMessageType.NEW_COMMENT, {
        comment: { ...comment, id: generateId(), timestamp: Date.now() },
      });
    },
    [isJoiningRoom]
  );

  const sendStamp = useCallback(
    async (stamp: Stamp, position?: { x: number; y: number }) => {
      const socket = socketRef.current;
      if (!socket || isJoiningRoom) return false;
      const stampMessage: StampMessage = {
        id: generateId(),
        stamp,
        timestamp: Date.now(),
        position,
      };
      return socket.sendWhenOpen(WebSocketMessageType.NEW_STAMP, {
        stamp: stampMessage,
      });
    },
    [isJoiningRoom]
  );

  const reconnect = useCallback(() => socketRef.current?.reconnectNow(), []);

  return {
    isConnected,
    isJoiningRoom,
    error,
    commentHistory,
    rooms,
    currentRoom,
    joinRoom,
    createRoom,
    refreshRooms,
    sendComment,
    sendStamp,
    reconnect,
  };
}
