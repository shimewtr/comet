import { QueryCommand, type AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { RoomEvent } from '@comet/shared';
import { toEvent } from './formatters.js';

const client = new DynamoDBClient({});
const eventsTable = process.env.ROOM_EVENTS_TABLE_NAME!;
const MAX_EVENTS = 10_000;

function values(roomId: string, from: number, to: number) {
  return marshall({ ':roomId': roomId, ':from': `${String(from).padStart(13, '0')}#`, ':to': `${String(to).padStart(13, '0')}#\uffff`, ':now': Math.floor(Date.now() / 1000) });
}

export async function queryAllEvents(roomId: string, from: number, to: number): Promise<RoomEvent[]> {
  const events: RoomEvent[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: eventsTable, KeyConditionExpression: 'roomId = :roomId AND sk BETWEEN :from AND :to', FilterExpression: '#ttl > :now',
      ExpressionAttributeNames: { '#ttl': 'ttl' }, ExpressionAttributeValues: values(roomId, from, to), ExclusiveStartKey: cursor,
    }));
    events.push(...(result.Items ?? []).map((item) => toEvent(unmarshall(item) as RoomEvent)));
    if (events.length > MAX_EVENTS) throw new Error('too many events');
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return events;
}

export async function queryEventsPage(roomId: string, from: number, to: number, limit: number, cursor?: Record<string, AttributeValue>) {
  const result = await client.send(new QueryCommand({
    TableName: eventsTable, KeyConditionExpression: 'roomId = :roomId AND sk BETWEEN :from AND :to', FilterExpression: '#ttl > :now',
    ExpressionAttributeNames: { '#ttl': 'ttl' }, ExpressionAttributeValues: values(roomId, from, to), Limit: limit, ExclusiveStartKey: cursor,
  }));
  return { events: (result.Items ?? []).map((item) => toEvent(unmarshall(item) as RoomEvent)), cursor: result.LastEvaluatedKey };
}
