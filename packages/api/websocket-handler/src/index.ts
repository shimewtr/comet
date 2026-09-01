import {
  APIGatewayProxyWebsocketHandlerV2,
  APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda';
import { createHash } from 'node:crypto';
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
  Poll,
  PollOption,
  PollResult,
  PollControlPayload,
  PollStatePayload,
  StartPollPayload,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
  MIN_POLL_DURATION_SECONDS,
  MAX_POLL_DURATION_SECONDS,
  MAX_POLL_TITLE_LENGTH,
  MAX_POLL_LABEL_LENGTH,
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
  createPoll,
  endPollVoting,
  getConnectionParticipantKey,
  getPoll,
  getPollVotes,
  PollRecord,
  recordPollVote,
  removePoll,
  savePollResults,
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
const PARTICIPANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function participantKey(value: string | undefined): string | undefined {
  if (!value || !PARTICIPANT_ID_PATTERN.test(value)) return undefined;
  return createHash('sha256').update(value).digest('hex');
}

function normalizedPollOptions(value: unknown): PollOption[] | null {
  if (
    !Array.isArray(value) ||
    value.length < MIN_POLL_OPTIONS ||
    value.length > MAX_POLL_OPTIONS
  ) {
    return null;
  }
  const options: PollOption[] = [];
  const optionIds = new Set<string>();
  const emojiIds = new Set<string>();
  for (const item of value) {
    const candidate = item as Partial<PollOption>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const emojiId =
      typeof candidate.emojiId === 'string'
        ? candidate.emojiId.trim().toLowerCase()
        : '';
    const emoji =
      typeof candidate.emoji === 'string' ? candidate.emoji.trim() : '';
    const label =
      typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (
      !id ||
      id.length > 64 ||
      !emojiId.startsWith('emoji-') ||
      emojiId.length > 128 ||
      !emoji ||
      emoji.length > 32 ||
      !label ||
      label.length > MAX_POLL_LABEL_LENGTH ||
      optionIds.has(id) ||
      emojiIds.has(emojiId)
    ) {
      return null;
    }
    optionIds.add(id);
    emojiIds.add(emojiId);
    options.push({ id, emojiId, emoji, label });
  }
  return options;
}

/**
 * emoji-picker-react はBMPのUnicode scalarを4桁ゼロ埋めで表す。
 * macOSの入力欄や過去の投票ではゼロ埋めなしのIDもあり得るため、
 * 比較時だけ同じUnicode scalar列へ正規化する。
 */
function normalizedEmojiId(emojiId: string): string {
  const prefix = 'emoji-';
  const value = emojiId.trim().toLowerCase();
  if (!value.startsWith(prefix)) return value;
  return `${prefix}${value
    .slice(prefix.length)
    .split('-')
    .map((scalar) => {
      const codePoint = Number.parseInt(scalar, 16);
      return Number.isFinite(codePoint) ? codePoint.toString(16) : scalar;
    })
    .join('-')}`;
}

function pollResults(
  record: PollRecord,
  votes: Array<{ optionId: string }>
): PollResult[] {
  const counts = new Map(record.options.map((option) => [option.id, 0]));
  for (const vote of votes) {
    if (counts.has(vote.optionId)) {
      counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return record.options.map((option) => {
    const count = counts.get(option.id) ?? 0;
    return {
      optionId: option.id,
      count,
      percentage: total === 0 ? 0 : (count / total) * 100,
    };
  });
}

function publicPoll(
  record: PollRecord,
  totalVotes = record.totalVotes ?? 0
): Poll {
  return {
    id: record.id,
    roomId: record.roomId,
    title: record.title,
    options: record.options,
    status: record.status,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    totalVotes,
    ...(record.status === 'ended' ? { results: record.results ?? [] } : {}),
  };
}

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
    await saveConnection(
      connectionId,
      GLOBAL_ROOM_ID,
      participantKey(event.queryStringParameters?.participantId)
    );
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

    const sendError = async (code: ErrorPayload['code'], message: string) => {
      await sendToRequester<ErrorPayload>(WebSocketMessageType.ERROR, {
        code,
        message,
      });
    };

    const sendPollStateTo = async (
      connectionIds: string[],
      roomId: string,
      poll: Poll | null
    ) => {
      const response: WebSocketMessage<PollStatePayload> = {
        type: WebSocketMessageType.POLL_STATE,
        payload: { poll },
        timestamp: Date.now(),
        roomId,
      };
      await broadcastMessage(apiGatewayClient, connectionIds, response);
    };

    const finalizePoll = async (record: PollRecord): Promise<Poll | null> => {
      if (record.status === 'active') {
        const locked = await endPollVoting(
          record.roomId,
          record.id,
          record.controllerId
        );
        if (!locked) {
          const current = await getPoll(record.roomId);
          if (!current) return null;
          record = current;
          // Another request may still be completing the transition. Do not
          // calculate or persist results until the active poll is locked.
          if (record.status === 'active') {
            const votes = await getPollVotes(record.id);
            return publicPoll(record, votes.length);
          }
        } else {
          record = { ...record, status: 'ended' };
        }
      }
      const votes = await getPollVotes(record.id);
      const results = pollResults(record, votes);
      const totalVotes = results.reduce((sum, result) => sum + result.count, 0);
      await savePollResults(record.roomId, record.id, results, totalVotes);
      return publicPoll({ ...record, results, totalVotes }, totalVotes);
    };

    const currentPoll = async (roomId: string): Promise<Poll | null> => {
      const record = await getPoll(roomId);
      if (!record) return null;
      if (record.status === 'active' && record.endsAt <= Date.now()) {
        return await finalizePoll(record);
      }
      if (record.status === 'active') {
        const votes = await getPollVotes(record.id);
        return publicPoll(record, votes.length);
      }
      if (!record.results) return await finalizePoll(record);
      return publicPoll(record);
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

        // 通常のスタンプ表示はそのまま行い、実施中の投票対象と一致する場合だけ
        // 匿名ブラウザの最終票を更新する。
        const poll = await getPoll(roomId);
        const option =
          poll?.status === 'active'
            ? poll.options.find(
                (candidate) =>
                  normalizedEmojiId(candidate.emojiId) ===
                  normalizedEmojiId(stampMessage.stamp.id)
              )
            : undefined;
        if (poll && option) {
          if (poll.endsAt <= Date.now()) {
            const ended = await finalizePoll(poll);
            await sendPollStateTo(
              await getRoomConnections(roomId),
              roomId,
              ended
            );
          } else {
            const connectionParticipantKey =
              await getConnectionParticipantKey(connectionId);
            if (connectionParticipantKey) {
              const voterKey = createHash('sha256')
                .update(`${poll.id}:${connectionParticipantKey}`)
                .digest('hex');
              const recorded = await recordPollVote(
                roomId,
                poll.id,
                voterKey,
                option.id,
                Date.now()
              );
              if (recorded) {
                const votes = await getPollVotes(poll.id);
                await sendPollStateTo(
                  await getRoomConnections(roomId),
                  roomId,
                  publicPoll(poll, votes.length)
                );
              }
            }
          }
        }

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

      case WebSocketMessageType.POLL_STATE_REQUEST: {
        const roomId = await getConnectionRoom(connectionId);
        await sendToRequester<PollStatePayload>(
          WebSocketMessageType.POLL_STATE,
          { poll: await currentPoll(roomId) },
          roomId
        );
        break;
      }

      case WebSocketMessageType.POLL_START: {
        const payload = message.payload as StartPollPayload;
        const roomId = await currentRoomForActivity();
        if (!roomId) break;
        const title =
          typeof payload?.title === 'string' ? payload.title.trim() : '';
        const controllerId =
          typeof payload?.controllerId === 'string'
            ? payload.controllerId.trim()
            : '';
        const durationSeconds = payload?.durationSeconds;
        const options = normalizedPollOptions(payload?.options);
        if (
          !controllerId ||
          controllerId.length > 128 ||
          title.length > MAX_POLL_TITLE_LENGTH ||
          typeof durationSeconds !== 'number' ||
          !Number.isInteger(durationSeconds) ||
          durationSeconds < MIN_POLL_DURATION_SECONDS ||
          durationSeconds > MAX_POLL_DURATION_SECONDS ||
          !options
        ) {
          await sendError('POLL_INVALID', 'Poll settings are invalid');
          break;
        }
        const startsAt = Date.now();
        const record: PollRecord = {
          id: generateId(),
          roomId,
          controllerId,
          title,
          options,
          status: 'active',
          startsAt,
          endsAt: startsAt + durationSeconds * 1000,
          totalVotes: 0,
        };
        if (!(await createPoll(record))) {
          await sendError(
            'POLL_ALREADY_ACTIVE',
            'A poll is already active in this room'
          );
          break;
        }
        await sendPollStateTo(
          await getRoomConnections(roomId),
          roomId,
          publicPoll(record)
        );
        break;
      }

      case WebSocketMessageType.POLL_END: {
        const payload = message.payload as PollControlPayload;
        const roomId = await getConnectionRoom(connectionId);
        const record = await getPoll(roomId);
        if (!record || record.id !== payload?.pollId) {
          await sendError('POLL_NOT_FOUND', 'Poll was not found');
          break;
        }
        if (record.controllerId !== payload?.controllerId) {
          await sendError(
            'POLL_FORBIDDEN',
            'Only the poll controller can end it'
          );
          break;
        }
        const ended = await finalizePoll(record);
        await sendPollStateTo(await getRoomConnections(roomId), roomId, ended);
        break;
      }

      case WebSocketMessageType.POLL_CANCEL:
      case WebSocketMessageType.POLL_CLOSE: {
        const payload = message.payload as PollControlPayload;
        const roomId = await getConnectionRoom(connectionId);
        const expectedStatus =
          message.type === WebSocketMessageType.POLL_CANCEL
            ? 'active'
            : 'ended';
        const removed = await removePoll(
          roomId,
          payload?.pollId,
          payload?.controllerId,
          expectedStatus
        );
        if (!removed) {
          await sendError(
            'POLL_FORBIDDEN',
            'Poll cannot be changed by this controller'
          );
          break;
        }
        await sendPollStateTo(await getRoomConnections(roomId), roomId, null);
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
        await sendToRequester<PollStatePayload>(
          WebSocketMessageType.POLL_STATE,
          { poll: await currentPoll(room.id) },
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
          await sendToRequester<PollStatePayload>(
            WebSocketMessageType.POLL_STATE,
            { poll: await currentPoll(GLOBAL_ROOM_ID) },
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
        await sendToRequester<PollStatePayload>(
          WebSocketMessageType.POLL_STATE,
          { poll: await currentPoll(room.id) },
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
