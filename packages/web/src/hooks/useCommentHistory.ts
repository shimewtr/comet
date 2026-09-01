import { useCallback, useState, type MutableRefObject } from 'react';
import {
  type Comment,
  type HistoryPayload,
  type IncomingWebSocketMessage,
  type NewCommentPayload,
  WebSocketMessageType,
} from '@comet/shared';
import { mergeCommentHistory } from './websocket-session-utils';

export function useCommentHistory(roomIdRef: MutableRefObject<string | null>) {
  const [commentHistory, setCommentHistory] = useState<Comment[]>([]);
  const clearCommentHistory = useCallback(() => setCommentHistory([]), []);

  const handleNewComment = useCallback(
    (
      payload: NewCommentPayload,
      message: IncomingWebSocketMessage<WebSocketMessageType.NEW_COMMENT>
    ) => {
      if (!roomIdRef.current || message.roomId !== roomIdRef.current) return;
      setCommentHistory((previous) =>
        mergeCommentHistory(previous, [payload.comment])
      );
    },
    [roomIdRef]
  );

  const handleHistory = useCallback(
    (
      payload: HistoryPayload,
      message: IncomingWebSocketMessage<WebSocketMessageType.HISTORY>
    ) => {
      if (!roomIdRef.current || message.roomId !== roomIdRef.current) return;
      setCommentHistory((previous) =>
        mergeCommentHistory(previous, payload.comments)
      );
    },
    [roomIdRef]
  );

  return { commentHistory, clearCommentHistory, handleNewComment, handleHistory };
}
