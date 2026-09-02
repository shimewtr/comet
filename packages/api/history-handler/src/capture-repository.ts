import { QueryCommand, type AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({});
const capturesTable = process.env.ROOM_CAPTURES_TABLE_NAME!;

export interface CaptureRecord { capturedAt: number; s3Key: string; }

export async function getCaptures(roomId: string): Promise<CaptureRecord[]> {
  const captures: CaptureRecord[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: capturesTable, KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: '#ttl > :now', ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: marshall({ ':roomId': roomId, ':now': Math.floor(Date.now() / 1000) }), ExclusiveStartKey: cursor,
    }));
    captures.push(...(result.Items ?? []).map((item) => unmarshall(item) as CaptureRecord));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return captures;
}
