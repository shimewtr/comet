import {
  DeleteItemCommand,
  QueryCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { GLOBAL_ROOM_ID } from '@comet/shared';
import { client, tables } from './client';

interface ConnectionRecord {
  roomId: string;
  participantKey?: string;
}

async function getConnectionRecords(connectionId: string): Promise<ConnectionRecord[]> {
  const result = await client.send(
    new QueryCommand({
      TableName: tables.connections,
      KeyConditionExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: marshall({ ':connectionId': connectionId }),
      ProjectionExpression: 'roomId, participantKey',
    })
  );
  return (result.Items ?? []).map((item) => {
    const value = unmarshall(item);
    return {
      roomId: value.roomId as string,
      participantKey: value.participantKey as string | undefined,
    };
  });
}

export async function saveConnection(
  connectionId: string,
  roomId: string,
  participantKey?: string
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 7200;
  await client.send(
    new PutItemCommand({
      TableName: tables.connections,
      Item: marshall({
        connectionId,
        roomId,
        connectedAt: Date.now(),
        ...(participantKey ? { participantKey } : {}),
        ttl,
      }),
    })
  );
}

export async function removeConnection(connectionId: string): Promise<void> {
  const memberships = (await getConnectionRecords(connectionId)).map((record) => record.roomId);
  await Promise.all(
    memberships.map((roomId) =>
      client.send(
        new DeleteItemCommand({
          TableName: tables.connections,
          Key: marshall({ connectionId, roomId }),
        })
      )
    )
  );
}

export async function getConnectionParticipantKey(connectionId: string): Promise<string | null> {
  return (await getConnectionRecords(connectionId))[0]?.participantKey ?? null;
}

export async function getConnectionRoom(connectionId: string): Promise<string> {
  const memberships = (await getConnectionRecords(connectionId)).map((record) => record.roomId);
  if (memberships.length === 1) return memberships[0];
  await moveConnectionToRoom(connectionId, GLOBAL_ROOM_ID);
  return GLOBAL_ROOM_ID;
}

export async function moveConnectionToRoom(connectionId: string, roomId: string): Promise<void> {
  const records = await getConnectionRecords(connectionId);
  const memberships = records.map((record) => record.roomId);
  if (memberships.length === 1 && memberships[0] === roomId) return;

  const now = Date.now();
  const ttl = Math.floor(now / 1000) + 7200;
  await client.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        ...memberships.map((oldRoomId) => ({
          Delete: {
            TableName: tables.connections,
            Key: marshall({ connectionId, roomId: oldRoomId }),
          },
        })),
        {
          Put: {
            TableName: tables.connections,
            Item: marshall({
              connectionId,
              roomId,
              connectedAt: now,
              ...(records[0]?.participantKey ? { participantKey: records[0].participantKey } : {}),
              ttl,
            }),
          },
        },
      ],
    })
  );
}

export async function getRoomConnections(roomId: string): Promise<string[]> {
  const connectionIds: string[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tables.connections,
        IndexName: 'RoomIdIndex',
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: marshall({ ':roomId': roomId }),
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
