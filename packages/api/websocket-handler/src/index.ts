import {
  APIGatewayProxyWebsocketHandlerV2,
  APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda';
import {
  WebSocketMessage,
  WebSocketMessageType,
  NewCommentPayload,
  NewStampPayload,
  Comment,
  StampCategory,
  StampMessage,
  validatePostCommentRequest,
  sanitizeCommentStyle,
  isAllowedStampImageUrl,
  generateId,
  GLOBAL_ROOM_ID,
  GLOBAL_ROOM,
  normalizeRoomName,
  CreateRoomPayload,
  JoinRoomPayload,
  RoomListPayload,
  RoomCreatedPayload,
  RoomJoinedPayload,
  ErrorPayload,
} from '@comet/shared';
import {
  saveConnection,
  removeConnection,
  getRoomConnections,
  saveComment,
  saveRoomEvent,
  saveStampEvent,
  getRecentComments,
  getConnectionRoom,
  moveConnectionToRoom,
  getActiveRooms,
  createRoom,
  touchRoom,
  getActiveRoom,
} from './dynamodb-client';
import {
  createApiGatewayClient,
  broadcastMessage,
  sendMessageToConnection,
} from './api-gateway-client';

const HANDLER_TYPE = process.env.HANDLER_TYPE || 'message';
// イベント全文などの冗長なログはデバッグ時のみ出す（CloudWatch Logsのコスト削減と
// コメント本文をログに残さないため）
const DEBUG_LOGGING = process.env.LOG_LEVEL === 'debug';
const MAX_STAMP_NAME_LENGTH = 50;
const STAMP_CATEGORIES: readonly StampCategory[] = [
  'emotion',
  'reaction',
  'custom',
];

/**
 * WebSocket接続ハンドラー
 */
async function handleConnect(
  event: APIGatewayProxyWebsocketEventV2
): Promise<{ statusCode: number }> {
  const connectionId = event.requestContext.connectionId;
  console.log(`New connection: ${connectionId}`);

  try {
    // 接続時に自動的にグローバルルームに参加
    await saveConnection(connectionId, GLOBAL_ROOM_ID);
  } catch (error) {
    console.error('Error saving connection:', error);
    return { statusCode: 500 };
  }

  return { statusCode: 200 };
}

/**
 * WebSocket切断ハンドラー
 */
async function handleDisconnect(
  event: APIGatewayProxyWebsocketEventV2
): Promise<{ statusCode: number }> {
  const connectionId = event.requestContext.connectionId;
  console.log(`Disconnection: ${connectionId}`);

  try {
    await removeConnection(connectionId);
  } catch (error) {
    console.error('Error removing connection:', error);
  }

  return { statusCode: 200 };
}

/**
 * WebSocketメッセージハンドラー
 */
async function handleMessage(
  event: APIGatewayProxyWebsocketEventV2
): Promise<{ statusCode: number }> {
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  if (DEBUG_LOGGING) {
    console.log(`Message from ${connectionId}:`, event.body);
  }

  try {
    if (!event.body) {
      return { statusCode: 400 };
    }

    const message: WebSocketMessage = JSON.parse(event.body);
    const endpoint = `https://${domainName}/${stage}`;
    const apiGatewayClient = createApiGatewayClient(endpoint);

    const sendToRequester = async <T>(
      type: WebSocketMessageType,
      payload: T,
      roomId?: string
    ) => {
      const response: WebSocketMessage<T> = {
        type,
        payload,
        timestamp: Date.now(),
        roomId,
      };
      await sendMessageToConnection(
        apiGatewayClient,
        connectionId,
        Buffer.from(JSON.stringify(response))
      );
    };

    const fallbackToGlobal = async () => {
      await moveConnectionToRoom(connectionId, GLOBAL_ROOM_ID);
      const payload: ErrorPayload = {
        code: 'ROOM_EXPIRED',
        message: 'Room is unavailable or expired',
        fallbackRoom: GLOBAL_ROOM,
      };
      await sendToRequester(
        WebSocketMessageType.ERROR,
        payload,
        GLOBAL_ROOM_ID
      );
    };

    const currentRoomForActivity = async (): Promise<string | null> => {
      const roomId = await getConnectionRoom(connectionId);
      if (roomId === GLOBAL_ROOM_ID) return roomId;
      if (await touchRoom(roomId)) return roomId;
      await fallbackToGlobal();
      return null;
    };

    switch (message.type) {
      case WebSocketMessageType.NEW_COMMENT: {
        const payload = message.payload as NewCommentPayload;
        const rawComment = payload?.comment;

        if (!rawComment || typeof rawComment.content !== 'string') {
          console.warn('Rejected comment: invalid payload shape');
          return { statusCode: 400 };
        }

        const validation = validatePostCommentRequest({
          content: rawComment.content,
        });
        if (!validation.valid) {
          console.warn(`Rejected comment: ${validation.error}`);
          return { statusCode: 400 };
        }

        const roomId = await currentRoomForActivity();
        if (!roomId) break;

        // 検証済みのフィールドのみでブロードキャスト用コメントを組み立てる
        const comment: Comment = {
          id: generateId(),
          content: rawComment.content,
          style: sanitizeCommentStyle(rawComment.style),
          timestamp: Date.now(),
        };

        // 履歴保存の失敗は配信を妨げない
        const savePromise = Promise.all([
          saveComment(roomId, comment),
          saveRoomEvent(roomId, {
            type: 'comment',
            timestamp: comment.timestamp,
            comment,
          }),
        ]).catch((error) => {
          console.error('Failed to save comment history:', error);
        });

        // 現在参加しているroom内の全接続にブロードキャスト
        const connectionIds = await getRoomConnections(roomId);
        const broadcastPayload: WebSocketMessage<NewCommentPayload> = {
          type: WebSocketMessageType.NEW_COMMENT,
          payload: { comment },
          timestamp: Date.now(),
          roomId,
        };

        const result = await broadcastMessage(
          apiGatewayClient,
          connectionIds,
          broadcastPayload
        );
        await savePromise;

        console.log(
          `Broadcast to ${result.sent} connections, ${result.failed} failed`
        );
        break;
      }

      case WebSocketMessageType.NEW_STAMP: {
        const payload = message.payload as NewStampPayload;
        const rawStampMessage = payload?.stamp;
        const rawStamp = rawStampMessage?.stamp;

        if (
          !rawStamp ||
          typeof rawStamp.name !== 'string' ||
          rawStamp.name.length === 0 ||
          rawStamp.name.length > MAX_STAMP_NAME_LENGTH ||
          !STAMP_CATEGORIES.includes(rawStamp.category)
        ) {
          console.warn('Rejected stamp: invalid payload shape');
          return { statusCode: 400 };
        }

        const roomId = await currentRoomForActivity();
        if (!roomId) break;

        // カスタムスタンプは許可された配信元の画像URLのみ受け付ける
        if (
          rawStamp.category === 'custom' &&
          !isAllowedStampImageUrl(rawStamp.imageUrl)
        ) {
          console.warn(
            `Rejected stamp: disallowed imageUrl ${rawStamp.imageUrl}`
          );
          return { statusCode: 400 };
        }

        const rawPosition = rawStampMessage.position;
        const position =
          typeof rawPosition?.x === 'number' &&
          Number.isFinite(rawPosition.x) &&
          typeof rawPosition?.y === 'number' &&
          Number.isFinite(rawPosition.y)
            ? { x: rawPosition.x, y: rawPosition.y }
            : undefined;

        // 検証済みのフィールドのみでブロードキャスト用スタンプを組み立てる
        const stampMessage: StampMessage = {
          id:
            typeof rawStampMessage.id === 'string' && rawStampMessage.id
              ? rawStampMessage.id
              : generateId(),
          stamp: {
            id: typeof rawStamp.id === 'string' ? rawStamp.id : '',
            name: rawStamp.name,
            imageUrl: rawStamp.category === 'custom' ? rawStamp.imageUrl : '',
            category: rawStamp.category,
          },
          timestamp: Date.now(),
          position,
        };

        const savePromise = saveStampEvent(roomId, stampMessage).catch(
          (error) => {
            console.error('Failed to save stamp history:', error);
          }
        );

        // 現在参加しているroom内の全接続にブロードキャスト
        const connectionIds = await getRoomConnections(roomId);
        const broadcastPayload: WebSocketMessage<NewStampPayload> = {
          type: WebSocketMessageType.NEW_STAMP,
          payload: { stamp: stampMessage },
          timestamp: Date.now(),
          roomId,
        };

        const stampResult = await broadcastMessage(
          apiGatewayClient,
          connectionIds,
          broadcastPayload
        );
        await savePromise;

        console.log(
          `Broadcast stamp to ${stampResult.sent} connections, ${stampResult.failed} failed`
        );
        break;
      }

      case WebSocketMessageType.HISTORY_REQUEST: {
        const roomId = await getConnectionRoom(connectionId);
        if (roomId !== GLOBAL_ROOM_ID && !(await getActiveRoom(roomId))) {
          await fallbackToGlobal();
          break;
        }
        // 直近のコメント履歴をリクエスト元の接続にだけ返す
        const comments = await getRecentComments(roomId);
        await sendToRequester(
          WebSocketMessageType.HISTORY,
          { comments },
          roomId
        );
        break;
      }

      case WebSocketMessageType.ROOM_LIST_REQUEST: {
        const rooms = [GLOBAL_ROOM, ...(await getActiveRooms())];
        const payload: RoomListPayload = { rooms };
        await sendToRequester(WebSocketMessageType.ROOM_LIST, payload);
        break;
      }

      case WebSocketMessageType.CREATE_ROOM: {
        const payload = message.payload as CreateRoomPayload;
        const name = normalizeRoomName(payload?.name);
        if (!name) {
          await sendToRequester<ErrorPayload>(WebSocketMessageType.ERROR, {
            code: 'INVALID_ROOM_NAME',
            message:
              'Room name must be 1-50 characters without control characters',
          });
          break;
        }
        const room = await createRoom(name);
        await moveConnectionToRoom(connectionId, room.id);
        await sendToRequester<RoomCreatedPayload>(
          WebSocketMessageType.ROOM_CREATED,
          { room },
          room.id
        );
        await sendToRequester<RoomJoinedPayload>(
          WebSocketMessageType.ROOM_JOINED,
          { room },
          room.id
        );
        break;
      }

      case WebSocketMessageType.JOIN_ROOM: {
        const payload = message.payload as JoinRoomPayload;
        if (payload?.roomId === GLOBAL_ROOM_ID) {
          await moveConnectionToRoom(connectionId, GLOBAL_ROOM_ID);
          await sendToRequester<RoomJoinedPayload>(
            WebSocketMessageType.ROOM_JOINED,
            { room: GLOBAL_ROOM },
            GLOBAL_ROOM_ID
          );
          break;
        }
        if (typeof payload?.roomId !== 'string') {
          await sendToRequester<ErrorPayload>(WebSocketMessageType.ERROR, {
            code: 'INVALID_MESSAGE',
            message: 'roomId is required',
          });
          break;
        }
        const room = await touchRoom(payload.roomId);
        if (!room) {
          await fallbackToGlobal();
          break;
        }
        await moveConnectionToRoom(connectionId, room.id);
        await sendToRequester<RoomJoinedPayload>(
          WebSocketMessageType.ROOM_JOINED,
          { room },
          room.id
        );
        break;
      }

      case WebSocketMessageType.PING: {
        // Pongを返す
        await sendMessageToConnection(
          apiGatewayClient,
          connectionId,
          Buffer.from(
            JSON.stringify({
              type: WebSocketMessageType.PONG,
              payload: {},
              timestamp: Date.now(),
            })
          )
        );
        break;
      }

      default:
        console.log(`Unknown message type: ${message.type}`);
    }

    return { statusCode: 200 };
  } catch (error) {
    console.error('Error handling message:', error);
    return { statusCode: 500 };
  }
}

/**
 * メインハンドラー
 */
export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  if (DEBUG_LOGGING) {
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Handler type:', HANDLER_TYPE);
  }

  try {
    switch (HANDLER_TYPE) {
      case 'connect':
        return handleConnect(event);
      case 'disconnect':
        return handleDisconnect(event);
      case 'message':
        return handleMessage(event);
      default:
        console.error(`Unknown handler type: ${HANDLER_TYPE}`);
        return { statusCode: 500 };
    }
  } catch (error) {
    console.error('Handler error:', error);
    return { statusCode: 500 };
  }
};

// 認証オーソライザー（CDK側でhandler名 index.wsAuthorizer / index.httpAuthorizer として参照される）
export { wsAuthorizer, httpAuthorizer } from './authorizer';
