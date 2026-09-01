import {
  Comment,
  generateId,
  isAllowedStampImageUrl,
  NewCommentPayload,
  NewStampPayload,
  sanitizeCommentStyle,
  StampCategory,
  StampMessage,
  validatePostCommentRequest,
  WebSocketMessage,
  WebSocketMessageType,
} from '@comet/shared';
import { broadcastMessage, createApiGatewayClient } from '../api-gateway-client';
import {
  getRoomConnections,
  saveComment,
  saveRoomEvent,
  saveStampEvent,
} from '../dynamodb-client';
import { MessageContext } from './context';

const MAX_STAMP_NAME_LENGTH = 50;
const STAMP_CATEGORIES: readonly StampCategory[] = ['emotion', 'reaction', 'custom'];

export function createPostHandlers(
  context: MessageContext,
  apiGatewayClient: ReturnType<typeof createApiGatewayClient>,
  recordStampVote: (roomId: string, stampEmojiId: string) => Promise<void>
) {
  return {
    async comment(payload: NewCommentPayload | undefined): Promise<number> {
      const rawComment = payload?.comment;
      if (!rawComment || typeof rawComment.content !== 'string') return 400;
      const validation = validatePostCommentRequest({ content: rawComment.content });
      if (!validation.valid) return 400;
      const roomId = await context.currentRoomForActivity();
      if (!roomId) return 200;
      const comment: Comment = {
        id: generateId(), content: rawComment.content,
        style: sanitizeCommentStyle(rawComment.style), timestamp: Date.now(),
      };
      const savePromise = Promise.all([
        saveComment(roomId, comment),
        saveRoomEvent(roomId, { type: 'comment', timestamp: comment.timestamp, comment }),
      ]).catch((error) => console.error('Failed to save comment history:', error));
      const result = await broadcastMessage(apiGatewayClient, await getRoomConnections(roomId), {
        type: WebSocketMessageType.NEW_COMMENT,
        payload: { comment }, timestamp: Date.now(), roomId,
      } satisfies WebSocketMessage<NewCommentPayload>);
      await savePromise;
      console.log(`Broadcast to ${result.sent} connections, ${result.failed} failed`);
      return 200;
    },
    async stamp(payload: NewStampPayload | undefined): Promise<number> {
      const rawStampMessage = payload?.stamp;
      const rawStamp = rawStampMessage?.stamp;
      if (
        !rawStamp || typeof rawStamp.name !== 'string' ||
        rawStamp.name.length === 0 || rawStamp.name.length > MAX_STAMP_NAME_LENGTH ||
        !STAMP_CATEGORIES.includes(rawStamp.category)
      ) return 400;
      const roomId = await context.currentRoomForActivity();
      if (!roomId) return 200;
      if (rawStamp.category === 'custom' && !isAllowedStampImageUrl(rawStamp.imageUrl)) return 400;
      const rawPosition = rawStampMessage.position;
      const position =
        typeof rawPosition?.x === 'number' && Number.isFinite(rawPosition.x) &&
        typeof rawPosition?.y === 'number' && Number.isFinite(rawPosition.y)
          ? { x: rawPosition.x, y: rawPosition.y }
          : undefined;
      const stampMessage: StampMessage = {
        id: typeof rawStampMessage.id === 'string' && rawStampMessage.id ? rawStampMessage.id : generateId(),
        stamp: {
          id: typeof rawStamp.id === 'string' ? rawStamp.id : '',
          name: rawStamp.name,
          imageUrl: rawStamp.category === 'custom' ? rawStamp.imageUrl : '',
          category: rawStamp.category,
        },
        timestamp: Date.now(), position,
      };
      const savePromise = saveStampEvent(roomId, stampMessage).catch((error) =>
        console.error('Failed to save stamp history:', error)
      );
      const result = await broadcastMessage(apiGatewayClient, await getRoomConnections(roomId), {
        type: WebSocketMessageType.NEW_STAMP,
        payload: { stamp: stampMessage }, timestamp: Date.now(), roomId,
      } satisfies WebSocketMessage<NewStampPayload>);
      await savePromise;
      await recordStampVote(roomId, stampMessage.stamp.id);
      console.log(`Broadcast stamp to ${result.sent} connections, ${result.failed} failed`);
      return 200;
    },
  };
}
