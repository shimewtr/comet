import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export const client = new DynamoDBClient({});

export const tables = {
  connections: process.env.CONNECTIONS_TABLE_NAME!,
  comments: process.env.COMMENTS_TABLE_NAME!,
  rooms: process.env.ROOMS_TABLE_NAME!,
  roomEvents: process.env.ROOM_EVENTS_TABLE_NAME!,
  polls: process.env.POLLS_TABLE_NAME!,
  pollVotes: process.env.POLL_VOTES_TABLE_NAME!,
};
