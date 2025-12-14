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
  StampMessage,
} from '@comet/shared';
import {
  saveConnection,
  removeConnection,
  getRoomConnections,
} from './dynamodb-client';
import {
  createApiGatewayClient,
  broadcastMessage,
} from './api-gateway-client';

const HANDLER_TYPE = process.env.HANDLER_TYPE || 'message';
const GLOBAL_ROOM_ID = 'global'; // 全ユーザー共通のルームID

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
    console.log(`Connection ${connectionId} joined global room`);
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

  console.log(`Message from ${connectionId}:`, event.body);

  try {
    if (!event.body) {
      return { statusCode: 400 };
    }

    const message: WebSocketMessage = JSON.parse(event.body);
    const endpoint = `https://${domainName}/${stage}`;
    const apiGatewayClient = createApiGatewayClient(endpoint);

    switch (message.type) {
      case WebSocketMessageType.NEW_COMMENT: {
        const payload = message.payload as NewCommentPayload;

        // コメントにIDとタイムスタンプを追加
        const comment: Comment = {
          ...payload.comment,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        };

        // グローバルルーム内の全接続にブロードキャスト
        const connectionIds = await getRoomConnections(GLOBAL_ROOM_ID);
        const broadcastPayload: WebSocketMessage<NewCommentPayload> = {
          type: WebSocketMessageType.NEW_COMMENT,
          payload: { comment },
          timestamp: Date.now(),
        };

        const result = await broadcastMessage(
          apiGatewayClient,
          connectionIds,
          broadcastPayload
        );

        console.log(
          `Broadcast to ${result.sent} connections, ${result.failed} failed`
        );
        break;
      }

      case WebSocketMessageType.NEW_STAMP: {
        const payload = message.payload as NewStampPayload;

        // スタンプメッセージにIDとタイムスタンプを確保
        const stampMessage: StampMessage = {
          ...payload.stamp,
          id: payload.stamp.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        };

        // グローバルルーム内の全接続にブロードキャスト
        const connectionIds = await getRoomConnections(GLOBAL_ROOM_ID);
        const broadcastPayload: WebSocketMessage<NewStampPayload> = {
          type: WebSocketMessageType.NEW_STAMP,
          payload: { stamp: stampMessage },
          timestamp: Date.now(),
        };

        const stampResult = await broadcastMessage(
          apiGatewayClient,
          connectionIds,
          broadcastPayload
        );

        console.log(
          `Broadcast stamp to ${stampResult.sent} connections, ${stampResult.failed} failed`
        );
        break;
      }

      case WebSocketMessageType.PING: {
        // Pongを返す
        const apiGatewayClient = createApiGatewayClient(endpoint);
        await apiGatewayClient.send({
          ConnectionId: connectionId,
          Data: Buffer.from(
            JSON.stringify({
              type: WebSocketMessageType.PONG,
              payload: {},
              timestamp: Date.now(),
            })
          ),
        } as any);
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
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Handler type:', HANDLER_TYPE);

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
