import {
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { GLOBAL_ROOM_ID, Room, generateId } from '@comet/shared';
import { client, tables } from './client';

export const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
export const HISTORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function toRoom(value: Record<string, unknown>): Room {
  return {
    id: value.id as string,
    name: value.name as string,
    createdAt: value.createdAt as number,
    lastActiveAt: value.lastActiveAt as number,
    expiresAt: value.expiresAt as number,
  };
}

export async function getActiveRooms(): Promise<Room[]> {
  const rooms: Room[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  const now = Date.now();
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tables.rooms,
        FilterExpression: 'expiresAt > :now',
        ExpressionAttributeValues: marshall({ ':now': now }),
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    rooms.push(...(result.Items ?? []).map((item) => toRoom(unmarshall(item))));
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
      TableName: tables.rooms,
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

export async function touchRoom(roomId: string): Promise<Room | null> {
  if (roomId === GLOBAL_ROOM_ID) return null;
  const now = Date.now();
  const expiresAt = now + ROOM_TTL_MS;
  try {
    const result = await client.send(
      new UpdateItemCommand({
        TableName: tables.rooms,
        Key: marshall({ id: roomId }),
        UpdateExpression: 'SET lastActiveAt = :now, expiresAt = :expiresAt, #ttl = :ttl, historyPk = :historyPk',
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
    return toRoom(unmarshall(result.Attributes!));
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return null;
    throw error;
  }
}

export async function getActiveRoom(roomId: string): Promise<Room | null> {
  if (roomId === GLOBAL_ROOM_ID) return null;
  const result = await client.send(
    new GetItemCommand({
      TableName: tables.rooms,
      Key: marshall({ id: roomId }),
      ConsistentRead: true,
    })
  );
  if (!result.Item) return null;
  const room = toRoom(unmarshall(result.Item));
  return typeof room.expiresAt === 'number' && room.expiresAt > Date.now()
    ? room
    : null;
}
