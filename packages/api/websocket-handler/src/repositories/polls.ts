import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { PollOption, PollResult } from '@comet/shared';
import { client, tables } from './client';

export interface PollRecord {
  id: string;
  roomId: string;
  controllerId: string;
  title: string;
  options: PollOption[];
  status: 'active' | 'ended';
  startsAt: number;
  endsAt: number;
  results?: PollResult[];
  totalVotes?: number;
}

const POLL_TTL_SECONDS = 24 * 60 * 60;
const POLL_VOTE_TTL_SECONDS = 24 * 60 * 60;

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: string }).name === 'ConditionalCheckFailedException';
}

export async function createPoll(record: PollRecord): Promise<boolean> {
  try {
    await client.send(
      new PutItemCommand({
        TableName: tables.polls,
        Item: marshall({ ...record, ttl: Math.floor(Date.now() / 1000) + POLL_TTL_SECONDS }),
        ConditionExpression: 'attribute_not_exists(roomId)',
      })
    );
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

export async function getPoll(roomId: string): Promise<PollRecord | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: tables.polls,
      Key: marshall({ roomId }),
      ConsistentRead: true,
    })
  );
  return result.Item ? (unmarshall(result.Item) as PollRecord) : null;
}

export async function recordPollVote(
  roomId: string,
  pollId: string,
  voterKey: string,
  optionId: string,
  now: number
): Promise<boolean> {
  try {
    await client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: tables.polls,
              Key: marshall({ roomId }),
              ConditionExpression: 'id = :pollId AND #status = :active AND endsAt >= :now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: marshall({ ':pollId': pollId, ':active': 'active', ':now': now }),
            },
          },
          {
            Put: {
              TableName: tables.pollVotes,
              Item: marshall({
                pollId,
                voterKey,
                optionId,
                updatedAt: now,
                ttl: Math.floor(now / 1000) + POLL_VOTE_TTL_SECONDS,
              }),
            },
          },
        ],
      })
    );
    return true;
  } catch (error) {
    if (['TransactionCanceledException', 'ConditionalCheckFailedException'].includes((error as { name?: string }).name ?? '')) return false;
    throw error;
  }
}

export async function getPollVotes(pollId: string): Promise<Array<{ voterKey: string; optionId: string }>> {
  const votes: Array<{ voterKey: string; optionId: string }> = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tables.pollVotes,
        KeyConditionExpression: 'pollId = :pollId',
        ExpressionAttributeValues: marshall({ ':pollId': pollId }),
        ProjectionExpression: 'voterKey, optionId',
        ExclusiveStartKey: lastEvaluatedKey,
        ConsistentRead: true,
      })
    );
    votes.push(
      ...(result.Items ?? []).map((item) => {
        const value = unmarshall(item);
        return { voterKey: value.voterKey as string, optionId: value.optionId as string };
      })
    );
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return votes;
}

export async function endPollVoting(roomId: string, pollId: string, controllerId: string): Promise<boolean> {
  try {
    await client.send(
      new UpdateItemCommand({
        TableName: tables.polls,
        Key: marshall({ roomId }),
        UpdateExpression: 'SET #status = :ended',
        ConditionExpression: 'id = :pollId AND controllerId = :controllerId AND #status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: marshall({
          ':pollId': pollId,
          ':controllerId': controllerId,
          ':active': 'active',
          ':ended': 'ended',
        }),
      })
    );
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

export async function savePollResults(
  roomId: string,
  pollId: string,
  results: PollResult[],
  totalVotes: number
): Promise<void> {
  await client.send(
    new UpdateItemCommand({
      TableName: tables.polls,
      Key: marshall({ roomId }),
      UpdateExpression: 'SET results = :results, totalVotes = :totalVotes',
      ConditionExpression: 'id = :pollId AND #status = :ended',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall({
        ':pollId': pollId,
        ':ended': 'ended',
        ':results': results,
        ':totalVotes': totalVotes,
      }),
    })
  );
}

export async function removePoll(
  roomId: string,
  pollId: string,
  controllerId: string,
  expectedStatus: 'active' | 'ended'
): Promise<boolean> {
  try {
    await client.send(
      new DeleteItemCommand({
        TableName: tables.polls,
        Key: marshall({ roomId }),
        ConditionExpression: 'id = :pollId AND controllerId = :controllerId AND #status = :expectedStatus',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: marshall({
          ':pollId': pollId,
          ':controllerId': controllerId,
          ':expectedStatus': expectedStatus,
        }),
      })
    );
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}
