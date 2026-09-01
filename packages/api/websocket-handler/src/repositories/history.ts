import {
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Comment, GLOBAL_ROOM_ID, RoomEvent, StampMessage } from '@comet/shared';
import { client, tables } from './client';
import { HISTORY_TTL_MS, ROOM_TTL_MS } from './rooms';

const COMMENT_HISTORY_TTL_SECONDS = 60 * 60;

export async function saveRoomEvent(roomId: string, event: RoomEvent): Promise<void> {
  if (roomId === GLOBAL_ROOM_ID || !tables.roomEvents) return;
  const eventId = event.type === 'comment' ? event.comment.id : event.stamp.id;
  const counterName = event.type === 'comment' ? 'commentCount' : 'stampCount';
  const ttl = Math.floor((event.timestamp + HISTORY_TTL_MS + ROOM_TTL_MS) / 1000);
  await client.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: tables.roomEvents,
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
            TableName: tables.rooms,
            Key: marshall({ id: roomId }),
            UpdateExpression: `ADD ${counterName} :one`,
            ExpressionAttributeValues: marshall({ ':one': 1 }),
          },
        },
      ],
    })
  );
}

export async function saveStampEvent(roomId: string, stamp: StampMessage): Promise<void> {
  return saveRoomEvent(roomId, { type: 'stamp', timestamp: stamp.timestamp, stamp });
}

export async function saveComment(roomId: string, comment: Comment): Promise<void> {
  await client.send(
    new PutItemCommand({
      TableName: tables.comments,
      Item: marshall(
        {
          roomId,
          sk: `${comment.timestamp}#${comment.id}`,
          comment,
          ttl: Math.floor(Date.now() / 1000) + COMMENT_HISTORY_TTL_SECONDS,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

export async function getRecentComments(roomId: string, limit = 100): Promise<Comment[]> {
  const result = await client.send(
    new QueryCommand({
      TableName: tables.comments,
      KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: '#ttl > :now',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: marshall({
        ':roomId': roomId,
        ':now': Math.floor(Date.now() / 1000),
      }),
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (result.Items ?? []).map((item) => unmarshall(item).comment as Comment).reverse();
}
