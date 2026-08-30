import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
  TransactWriteItemsCommand,
  GetItemCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  Comment,
  GLOBAL_ROOM_ID,
  Room,
  RoomEvent,
  StampMessage,
  generateId,
} from '@comet/shared';

const client = new DynamoDBClient({});
const tableName = process.env.CONNECTIONS_TABLE_NAME!;
const commentsTableName = process.env.COMMENTS_TABLE_NAME!;
const roomsTableName = process.env.ROOMS_TABLE_NAME!;
const roomEventsTableName = process.env.ROOM_EVENTS_TABLE_NAME!;

// コメント履歴の保持時間（1時間）
const COMMENT_HISTORY_TTL_SECONDS = 60 * 60;
export const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const HISTORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * 接続情報を保存
 */
export async function saveConnection(
  connectionId: string,
  roomId: string
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 7200; // 2時間後

  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall({
        connectionId,
        roomId,
        connectedAt: Date.now(),
        ttl,
      }),
    })
  );
}

/**
 * 接続情報を削除
 */
export async function removeConnection(connectionId: string): Promise<void> {
  const memberships = await getConnectionMemberships(connectionId);
  await Promise.all(
    memberships.map((roomId) =>
      client.send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: marshall({ connectionId, roomId }),
        })
      )
    )
  );
}

async function getConnectionMemberships(
  connectionId: string
): Promise<string[]> {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: marshall({ ':connectionId': connectionId }),
      ProjectionExpression: 'roomId',
    })
  );
  return (result.Items ?? []).map((item) => unmarshall(item).roomId as string);
}

/** 接続が現在参加しているroom。所属が壊れている場合はglobalへ戻す */
export async function getConnectionRoom(connectionId: string): Promise<string> {
  const memberships = await getConnectionMemberships(connectionId);
  if (memberships.length === 1) return memberships[0];
  await moveConnectionToRoom(connectionId, GLOBAL_ROOM_ID);
  return GLOBAL_ROOM_ID;
}

/** 1接続=1roomを維持しながらroomを切り替える */
export async function moveConnectionToRoom(
  connectionId: string,
  roomId: string
): Promise<void> {
  const memberships = await getConnectionMemberships(connectionId);
  if (memberships.length === 1 && memberships[0] === roomId) return;

  const now = Date.now();
  const ttl = Math.floor(now / 1000) + 7200;
  await client.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        ...memberships.map((oldRoomId) => ({
          Delete: {
            TableName: tableName,
            Key: marshall({ connectionId, roomId: oldRoomId }),
          },
        })),
        {
          Put: {
            TableName: tableName,
            Item: marshall({ connectionId, roomId, connectedAt: now, ttl }),
          },
        },
      ],
    })
  );
}

/** 有効な一時roomの一覧（globalは呼び出し側で付加） */
export async function getActiveRooms(): Promise<Room[]> {
  const rooms: Room[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  const now = Date.now();
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: roomsTableName,
        FilterExpression: 'expiresAt > :now',
        ExpressionAttributeValues: marshall({ ':now': now }),
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    rooms.push(
      ...(result.Items ?? []).map((item) => {
        const value = unmarshall(item);
        return {
          id: value.id,
          name: value.name,
          createdAt: value.createdAt,
          lastActiveAt: value.lastActiveAt,
          expiresAt: value.expiresAt,
        } as Room;
      })
    );
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return rooms.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export async function createRoom(name: string): Promise<Room> {
  const now = Date.now();
  const room: Room = {
    id: generateId(),
    name,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + ROOM_TTL_MS,
  };
  await client.send(
    new PutItemCommand({
      TableName: roomsTableName,
      Item: marshall({
        ...room,
        historyPk: 'ROOM',
        commentCount: 0,
        stampCount: 0,
        ttl: Math.floor((now + HISTORY_TTL_MS) / 1000),
      }),
      ConditionExpression: 'attribute_not_exists(id)',
    })
  );
  return room;
}

/** roomが有効なら期限を延長して返す */
export async function touchRoom(roomId: string): Promise<Room | null> {
  if (roomId === GLOBAL_ROOM_ID) return null;
  const now = Date.now();
  const expiresAt = now + ROOM_TTL_MS;
  try {
    const result = await client.send(
      new UpdateItemCommand({
        TableName: roomsTableName,
        Key: marshall({ id: roomId }),
        UpdateExpression:
          'SET lastActiveAt = :now, expiresAt = :expiresAt, #ttl = :ttl, historyPk = :historyPk',
        ConditionExpression: 'attribute_exists(id) AND expiresAt > :now',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: marshall({
          ':now': now,
          ':expiresAt': expiresAt,
          ':ttl': Math.floor((now + HISTORY_TTL_MS) / 1000),
          ':historyPk': 'ROOM',
        }),
        ReturnValues: 'ALL_NEW',
      })
    );
    const value = unmarshall(result.Attributes!);
    return {
      id: value.id,
      name: value.name,
      createdAt: value.createdAt,
      lastActiveAt: value.lastActiveAt,
      expiresAt: value.expiresAt,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return null;
    throw error;
  }
}

/** コメント・スタンプを分析用履歴として90日間保存する */
export async function saveRoomEvent(
  roomId: string,
  event: RoomEvent
): Promise<void> {
  if (roomId === GLOBAL_ROOM_ID || !roomEventsTableName) return;
  const eventId =
    event.type === 'comment' ? event.comment.id : event.stamp.id;
  const counterName =
    event.type === 'comment' ? 'commentCount' : 'stampCount';
  // room終了（3時間無操作）から90日間は、イベント本体も残るよう余裕を持たせる
  const ttl = Math.floor((event.timestamp + HISTORY_TTL_MS + ROOM_TTL_MS) / 1000);

  await client.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: roomEventsTableName,
            Item: marshall(
              {
                roomId,
                sk: `${String(event.timestamp).padStart(13, '0')}#${eventId}`,
                ...event,
                ttl,
              },
              { removeUndefinedValues: true }
            ),
            ConditionExpression: 'attribute_not_exists(roomId)',
          },
        },
        {
          Update: {
            TableName: roomsTableName,
            Key: marshall({ id: roomId }),
            UpdateExpression: `ADD ${counterName} :one`,
            ExpressionAttributeValues: marshall({ ':one': 1 }),
          },
        },
      ],
    })
  );
}

export async function saveStampEvent(
  roomId: string,
  stamp: StampMessage
): Promise<void> {
  return saveRoomEvent(roomId, {
    type: 'stamp',
    timestamp: stamp.timestamp,
    stamp,
  });
}

/** 期限を延長せずに有効なroomを取得する */
export async function getActiveRoom(roomId: string): Promise<Room | null> {
  if (roomId === GLOBAL_ROOM_ID) return null;
  const result = await client.send(
    new GetItemCommand({
      TableName: roomsTableName,
      Key: marshall({ id: roomId }),
      ConsistentRead: true,
    })
  );
  if (!result.Item) return null;
  const value = unmarshall(result.Item);
  if (value.expiresAt <= Date.now()) return null;
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    lastActiveAt: value.lastActiveAt,
    expiresAt: value.expiresAt,
  };
}

/**
 * ルーム内の全接続IDを取得
 */
export async function getRoomConnections(roomId: string): Promise<string[]> {
  const connectionIds: string[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

  // 1回のQueryは1MBで打ち切られるため、接続数が多い場合に備えてページングする
  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'RoomIdIndex',
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: marshall({
          ':roomId': roomId,
        }),
        ProjectionExpression: 'connectionId',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    for (const item of result.Items ?? []) {
      connectionIds.push(unmarshall(item).connectionId as string);
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return connectionIds;
}

/**
 * コメントを履歴として保存（TTLで1時間後に自動削除）
 */
export async function saveComment(
  roomId: string,
  comment: Comment
): Promise<void> {
  await client.send(
    new PutItemCommand({
      TableName: commentsTableName,
      Item: marshall(
        {
          roomId,
          // 時系列順に並び、同時刻でも衝突しないソートキー
          sk: `${comment.timestamp}#${comment.id}`,
          comment,
          ttl: Math.floor(Date.now() / 1000) + COMMENT_HISTORY_TTL_SECONDS,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

/**
 * ルームの直近コメントを取得（古い順で返す）
 * DynamoDBのTTL削除は遅延することがあるため、期限切れは読み出し時にも除外する
 */
export async function getRecentComments(
  roomId: string,
  limit = 100
): Promise<Comment[]> {
  const result = await client.send(
    new QueryCommand({
      TableName: commentsTableName,
      KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: '#ttl > :now',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: marshall({
        ':roomId': roomId,
        ':now': Math.floor(Date.now() / 1000),
      }),
      ScanIndexForward: false, // 新しい順に読んで
      Limit: limit,
    })
  );

  return (result.Items ?? [])
    .map((item) => unmarshall(item).comment as Comment)
    .reverse(); // 古い順に戻す
}
