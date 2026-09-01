import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { RoomRecord } from './formatters.js';

const client = new DynamoDBClient({});
const roomsTable = process.env.ROOMS_TABLE_NAME!;

/** DynamoDB reads for a single room, isolated from HTTP routing and response formatting. */
export async function getRoom(roomId: string): Promise<RoomRecord | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: roomsTable,
      Key: marshall({ id: roomId }),
    })
  );
  return result.Item ? (unmarshall(result.Item) as RoomRecord) : null;
}
