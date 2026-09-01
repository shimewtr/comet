import {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from 'aws-lambda';
import { createHash } from 'node:crypto';
import {
  ErrorPayload,
  GLOBAL_ROOM,
  GLOBAL_ROOM_ID,
  parseIncomingWebSocketMessage,
  PollStatePayload,
  WebSocketMessageType,
} from '@comet/shared';
import {
  broadcastMessage,
  createApiGatewayClient,
  sendMessageToConnection,
} from './api-gateway-client';
import {
  getConnectionRoom,
  moveConnectionToRoom,
  removeConnection,
  saveConnection,
  getRoomConnections,
} from './repositories/connections';
import { touchRoom } from './repositories/rooms';
import { MessageContext } from './handlers/context';
import { createPollHandlers } from './handlers/polls';
import { createPostHandlers } from './handlers/posts';
import { createRoomHandlers } from './handlers/rooms';

const HANDLER_TYPE = process.env.HANDLER_TYPE || 'message';
const DEBUG_LOGGING = process.env.LOG_LEVEL === 'debug';
const PARTICIPANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function participantKey(value: string | undefined): string | undefined {
  if (!value || !PARTICIPANT_ID_PATTERN.test(value)) return undefined;
  return createHash('sha256').update(value).digest('hex');
}

async function handleConnect(event: APIGatewayProxyWebsocketEventV2) {
  const connectionId = event.requestContext.connectionId;
  console.log(`New connection: ${connectionId}`);
  try {
    await saveConnection(
      connectionId,
      GLOBAL_ROOM_ID,
      participantKey(event.queryStringParameters?.participantId)
    );
    return { statusCode: 200 };
  } catch (error) {
    console.error('Error saving connection:', error);
    return { statusCode: 500 };
  }
}

async function handleDisconnect(event: APIGatewayProxyWebsocketEventV2) {
  console.log(`Disconnection: ${event.requestContext.connectionId}`);
  try {
    await removeConnection(event.requestContext.connectionId);
  } catch (error) {
    console.error('Error removing connection:', error);
  }
  return { statusCode: 200 };
}

async function handleMessage(event: APIGatewayProxyWebsocketEventV2) {
  const connectionId = event.requestContext.connectionId;
  if (DEBUG_LOGGING) {
    console.log(`Message from ${connectionId}:`, event.body);
  }
  if (!event.body) return { statusCode: 400 };
  try {
    const message = parseIncomingWebSocketMessage(event.body);
    if (!message) return { statusCode: 400 };
    const apiGatewayClient = createApiGatewayClient(
      `https://${event.requestContext.domainName}/${event.requestContext.stage}`
    );
    const sendToRequester: MessageContext['sendToRequester'] = async (
      type,
      payload,
      roomId
    ) => {
      await sendMessageToConnection(
        apiGatewayClient,
        connectionId,
        Buffer.from(JSON.stringify({ type, payload, timestamp: Date.now(), roomId }))
      );
    };
    const sendError: MessageContext['sendError'] = (code, text) =>
      sendToRequester<ErrorPayload>(WebSocketMessageType.ERROR, {
        code,
        message: text,
      });
    const sendPollState: MessageContext['sendPollState'] = async (
      roomId,
      poll
    ) => {
      await broadcastMessage(apiGatewayClient, await getRoomConnections(roomId), {
        type: WebSocketMessageType.POLL_STATE,
        payload: { poll } satisfies PollStatePayload,
        timestamp: Date.now(),
        roomId,
      });
    };
    const fallbackToGlobal = async () => {
      await moveConnectionToRoom(connectionId, GLOBAL_ROOM_ID);
      await sendToRequester<ErrorPayload>(
        WebSocketMessageType.ERROR,
        {
          code: 'ROOM_EXPIRED',
          message: 'Room is unavailable or expired',
          fallbackRoom: GLOBAL_ROOM,
        },
        GLOBAL_ROOM_ID
      );
    };
    const currentRoomForActivity = async () => {
      const roomId = await getConnectionRoom(connectionId);
      if (roomId === GLOBAL_ROOM_ID || (await touchRoom(roomId))) return roomId;
      await fallbackToGlobal();
      return null;
    };
    const context: MessageContext = {
      connectionId,
      sendToRequester,
      sendError,
      sendPollState,
      currentRoomForActivity,
      fallbackToGlobal,
    };
    const polls = createPollHandlers(context);
    const rooms = createRoomHandlers(context, polls.currentPoll);
    const posts = createPostHandlers(
      context,
      apiGatewayClient,
      polls.recordStampVote
    );

    switch (message.type) {
      case WebSocketMessageType.NEW_COMMENT:
        return { statusCode: await posts.comment(message.payload) };
      case WebSocketMessageType.NEW_STAMP:
        return { statusCode: await posts.stamp(message.payload) };
      case WebSocketMessageType.HISTORY_REQUEST:
        await rooms.history();
        break;
      case WebSocketMessageType.POLL_STATE_REQUEST: {
        const roomId = await getConnectionRoom(connectionId);
        await sendToRequester(
          WebSocketMessageType.POLL_STATE,
          { poll: await polls.currentPoll(roomId) },
          roomId
        );
        break;
      }
      case WebSocketMessageType.POLL_START:
        await polls.start(message.payload);
        break;
      case WebSocketMessageType.POLL_END:
        await polls.end(message.payload);
        break;
      case WebSocketMessageType.POLL_CANCEL:
        await polls.remove(message.payload, 'active');
        break;
      case WebSocketMessageType.POLL_CLOSE:
        await polls.remove(message.payload, 'ended');
        break;
      case WebSocketMessageType.ROOM_LIST_REQUEST:
        await rooms.list();
        break;
      case WebSocketMessageType.CREATE_ROOM:
        await rooms.create(message.payload);
        break;
      case WebSocketMessageType.JOIN_ROOM:
        await rooms.join(message.payload);
        break;
      case WebSocketMessageType.PING:
        await sendToRequester(WebSocketMessageType.PONG, {});
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
    return { statusCode: 200 };
  } catch (error) {
    console.error('Error handling message:', error);
    return { statusCode: 500 };
  }
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  if (DEBUG_LOGGING) {
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Handler type:', HANDLER_TYPE);
  }
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
};

export { wsAuthorizer, httpAuthorizer } from './authorizer';
