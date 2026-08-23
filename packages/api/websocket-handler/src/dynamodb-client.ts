import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Comment } from '@comet/shared';

const client = new DynamoDBClient({});
const tableName = process.env.CONNECTIONS_TABLE_NAME!;
const commentsTableName = process.env.COMMENTS_TABLE_NAME!;
const GLOBAL_ROOM_ID = 'global';

// コメント履歴の保持時間（1時間）
const COMMENT_HISTORY_TTL_SECONDS = 60 * 60;

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
  await client.send(
    new DeleteItemCommand({
      TableName: tableName,
      Key: marshall({
        connectionId,
        roomId: GLOBAL_ROOM_ID,
      }),
    })
  );
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
