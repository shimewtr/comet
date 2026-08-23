import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({});
const tableName = process.env.CONNECTIONS_TABLE_NAME!;
const GLOBAL_ROOM_ID = 'global';

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
