import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import type {
  HistoryBucket,
  PopularHistoryItem,
  RoomEvent,
  RoomHistoryDetail,
  Stamp,
} from '@comet/shared';
import { toEvent, toSummary } from './formatters.js';
import { getRoom } from './room-repository.js';
import {
  decodeCursor,
  encodeCursor,
  json,
  parseBoundedNumber,
  parseJsonBody,
  parseRange,
} from './http.js';

const client = new DynamoDBClient({});
const roomsTable = process.env.ROOMS_TABLE_NAME!;
const eventsTable = process.env.ROOM_EVENTS_TABLE_NAME!;
const capturesTable = process.env.ROOM_CAPTURES_TABLE_NAME!;
const captureBucket = process.env.CAPTURE_BUCKET_NAME!;
const s3 = new S3Client({});
const MAX_EVENTS = 10_000;

function hasErrorName(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function hasErrorMessage(error: unknown, message: string): boolean {
  return error instanceof Error && error.message === message;
}


async function queryAllEvents(
  roomId: string,
  from: number,
  to: number
): Promise<RoomEvent[]> {
  const events: RoomEvent[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await client.send(
      new QueryCommand({
        TableName: eventsTable,
        KeyConditionExpression: 'roomId = :roomId AND sk BETWEEN :from AND :to',
        FilterExpression: '#ttl > :now',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: marshall({
          ':roomId': roomId,
          ':from': `${String(from).padStart(13, '0')}#`,
          ':to': `${String(to).padStart(13, '0')}#\uffff`,
          ':now': Math.floor(Date.now() / 1000),
        }),
        ExclusiveStartKey: cursor,
      })
    );
    events.push(...(result.Items ?? []).map((item) => toEvent(unmarshall(item))));
    if (events.length > MAX_EVENTS) throw new Error('too many events');
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return events;
}

export function bucketSizeFor(duration: number): number {
  if (duration <= 30 * 60_000) return 10_000;
  if (duration <= 90 * 60_000) return 30_000;
  if (duration <= 3 * 60 * 60_000) return 60_000;
  return 5 * 60_000;
}

export function aggregateEvents(
  events: RoomEvent[],
  from: number,
  to: number,
  bucketSizeMs: number
): HistoryBucket[] {
  const buckets = new Map<number, RoomEvent[]>();
  for (const event of events) {
    const start = from + Math.floor((event.timestamp - from) / bucketSizeMs) * bucketSizeMs;
    const values = buckets.get(start) ?? [];
    values.push(event);
    buckets.set(start, values);
  }
  const result: HistoryBucket[] = [];
  for (let start = from; start <= to; start += bucketSizeMs) {
    const values = buckets.get(start) ?? [];
    const comments = values.filter((event) => event.type === 'comment');
    const stamps = values.filter((event) => event.type === 'stamp');
    const stampCounts = new Map<string, { stamp: Stamp; count: number }>();
    const itemCounts = new Map<string, PopularHistoryItem>();
    for (const event of comments) {
      if (event.type !== 'comment') continue;
      const key = `comment:${event.comment.content}`;
      const current = itemCounts.get(key);
      itemCounts.set(key, { type: 'comment', content: event.comment.content, count: (current?.count ?? 0) + 1 });
    }
    for (const event of stamps) {
      if (event.type !== 'stamp') continue;
      const key = event.stamp.stamp.id || event.stamp.stamp.name;
      const current = stampCounts.get(key);
      stampCounts.set(key, {
        stamp: event.stamp.stamp,
        count: (current?.count ?? 0) + 1,
      });
      const itemKey = `stamp:${key}`;
      const item = itemCounts.get(itemKey);
      itemCounts.set(itemKey, { type: 'stamp', stamp: event.stamp.stamp, count: (item?.count ?? 0) + 1 });
    }
    result.push({
      start,
      end: Math.min(start + bucketSizeMs, to),
      totalCount: values.length,
      commentCount: comments.length,
      stampCount: stamps.length,
      popularStamps: [...stampCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      popularItems: [...itemCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      sampleComments: comments
        .slice(-5)
        .map((event) => event.type === 'comment' ? event.comment : neverValue()),
    });
  }
  return result;
}

async function getCaptures(roomId: string) {
  const captures: Array<{ capturedAt: number; s3Key: string }> = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: capturesTable,
      KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: '#ttl > :now',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: marshall({ ':roomId': roomId, ':now': Math.floor(Date.now() / 1000) }),
      ExclusiveStartKey: cursor,
    }));
    captures.push(...(result.Items ?? []).map((item) => unmarshall(item) as { capturedAt: number; s3Key: string }));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return captures;
}

async function buildAnalysis(events: RoomEvent[], from: number, to: number, roomId: string) {
  const minuteBuckets = aggregateEvents(events, from, to, 60_000).filter((bucket) => bucket.totalCount > 0);
  const selected: HistoryBucket[] = [];
  for (const candidate of [...minuteBuckets].sort((a, b) => b.totalCount - a.totalCount || a.start - b.start)) {
    if (selected.every((peak) => Math.abs(peak.start - candidate.start) >= 3 * 60_000)) {
      selected.push(candidate);
      if (selected.length === 10) break;
    }
  }
  const captures = capturesTable ? (await getCaptures(roomId))
    .filter((capture) => capture.capturedAt >= from && capture.capturedAt <= to)
    .sort((a, b) => a.capturedAt - b.capturedAt)
    .slice(-1000) : [];
  const signedCaptures = await Promise.all(captures.map(async (capture) => ({
    capturedAt: capture.capturedAt,
    imageUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: captureBucket, Key: capture.s3Key }), { expiresIn: 900 }),
  })));
  const peaks = selected.map((peak) => {
    const nearest = signedCaptures
      .map((capture) => ({ capture, distance: Math.abs(capture.capturedAt - peak.start) }))
      .filter(({ distance }) => distance <= 30_000)
      .sort((a, b) => a.distance - b.distance)[0]?.capture;
    return {
      ...peak,
      capture: nearest,
    };
  });
  const stampCounts = new Map<string, { stamp: Stamp; count: number }>();
  for (const event of events) if (event.type === 'stamp') {
    const key = event.stamp.stamp.id || event.stamp.stamp.name;
    const current = stampCounts.get(key);
    stampCounts.set(key, { stamp: event.stamp.stamp, count: (current?.count ?? 0) + 1 });
  }
  const topStamp = [...stampCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  const comments = events.filter((event) => event.type === 'comment').length;
  return {
    peaks,
    captures: signedCaptures,
    metrics: {
      durationMs: Math.max(0, to - from),
      maxPostsPerMinute: minuteBuckets.reduce((max, bucket) => Math.max(max, bucket.totalCount), 0),
      peakAt: peaks[0]?.start ?? null,
      topStamp,
      commentRatio: events.length ? comments / events.length : 0,
    },
  };
}

function neverValue(): never {
  throw new Error('unexpected event type');
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const method = event.requestContext.http.method;
    if (method === 'OPTIONS') return { statusCode: 204 };

    const roomId = event.pathParameters?.roomId;
    const path = event.rawPath;
    if (method === 'POST' && roomId && path.endsWith('/recorder')) {
      const body = parseJsonBody(event.body);
      if (typeof body.deviceId !== 'string' || !body.deviceId) return json(400, { message: 'deviceId is required' });
      const now = Date.now();
      try {
        await client.send(new UpdateItemCommand({
          TableName: roomsTable,
          Key: marshall({ id: roomId }),
          UpdateExpression: 'SET recorderId = :deviceId, recorderExpiresAt = :expiresAt',
          ConditionExpression: 'attribute_exists(id) AND expiresAt > :now AND (attribute_not_exists(recorderId) OR recorderId = :deviceId OR recorderExpiresAt < :now)',
          ExpressionAttributeValues: marshall({ ':deviceId': body.deviceId, ':expiresAt': now + 120_000, ':now': now }),
        }));
        return json(200, { acquired: true, expiresAt: now + 120_000 });
      } catch (error: unknown) {
        if (hasErrorName(error, 'ConditionalCheckFailedException')) return json(409, { acquired: false });
        throw error;
      }
    }
    if (method === 'POST' && roomId && path.endsWith('/captures')) {
      const body = parseJsonBody(event.body);
      if (typeof body.deviceId !== 'string' || typeof body.dataUrl !== 'string') return json(400, { message: 'deviceId and dataUrl are required' });
      const match = body.dataUrl.match(/^data:image\/(jpeg|png);base64,(.+)$/);
      if (!match) return json(400, { message: 'JPEG or PNG image is required' });
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.length > 2 * 1024 * 1024) return json(413, { message: 'Capture exceeds 2MB' });
      const room = await getRoom(roomId);
      if (!room || room.expiresAt <= Date.now() || room.recorderId !== body.deviceId || room.recorderExpiresAt < Date.now()) return json(409, { message: 'Recorder lock is not active' });
      const capturedAt = Math.min(Math.max(Number(body.capturedAt) || Date.now(), Date.now() - 60_000), Date.now() + 5_000);
      const captureId = randomUUID();
      const extension = match[1] === 'png' ? 'png' : 'jpg';
      const s3Key = `${roomId}/${String(capturedAt).padStart(13, '0')}-${captureId}.${extension}`;
      await s3.send(new PutObjectCommand({ Bucket: captureBucket, Key: s3Key, Body: bytes, ContentType: `image/${match[1]}` }));
      await client.send(new PutItemCommand({ TableName: capturesTable, Item: marshall({ roomId, sk: `${String(capturedAt).padStart(13, '0')}#${captureId}`, capturedAt, s3Key, ttl: Math.floor((capturedAt + 90 * 24 * 60 * 60 * 1000) / 1000) }) }));
      return json(201, { capturedAt });
    }
    if (method !== 'GET') return json(405, { message: 'Method not allowed' });
    if (!roomId) {
      const limit = parseBoundedNumber(
        event.queryStringParameters?.limit,
        20,
        1,
        100
      );
      const result = await client.send(
        new QueryCommand({
          TableName: roomsTable,
          IndexName: 'HistoryIndex',
          KeyConditionExpression: 'historyPk = :pk',
          ExpressionAttributeValues: marshall({ ':pk': 'ROOM' }),
          ScanIndexForward: false,
          Limit: limit,
          ExclusiveStartKey: decodeCursor(event.queryStringParameters?.cursor),
        })
      );
      return json(200, {
        rooms: (result.Items ?? []).map((item) => toSummary(unmarshall(item))),
        cursor: encodeCursor(result.LastEvaluatedKey),
      });
    }

    const roomValue = await getRoom(roomId);
    if (!roomValue) return json(404, { message: 'Room history not found' });

    if (path.endsWith('/events')) {
      const { from, to } = parseRange(
        event.queryStringParameters ?? {},
        roomValue.createdAt,
        Date.now()
      );
      const limit = parseBoundedNumber(
        event.queryStringParameters?.limit,
        100,
        1,
        500
      );
      if (from > to) return json(400, { message: 'from must be before to' });
      const result = await client.send(
        new QueryCommand({
          TableName: eventsTable,
          KeyConditionExpression: 'roomId = :roomId AND sk BETWEEN :from AND :to',
          FilterExpression: '#ttl > :now',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: marshall({
            ':roomId': roomId,
            ':from': `${String(from).padStart(13, '0')}#`,
            ':to': `${String(to).padStart(13, '0')}#\uffff`,
            ':now': Math.floor(Date.now() / 1000),
          }),
          Limit: limit,
          ExclusiveStartKey: decodeCursor(event.queryStringParameters?.cursor),
        })
      );
      return json(200, {
        events: (result.Items ?? []).map((item) => toEvent(unmarshall(item))),
        cursor: encodeCursor(result.LastEvaluatedKey),
      });
    }

    const defaultTo = roomValue.expiresAt > Date.now() ? Date.now() : roomValue.lastActiveAt;
    const { from, to } = parseRange(
      event.queryStringParameters ?? {},
      roomValue.createdAt,
      defaultTo
    );
    if (from > to) return json(400, { message: 'from must be before to' });
    const events = await queryAllEvents(roomId, from, to);
    const bucketSizeMs = bucketSizeFor(to - from);
    const analysis = await buildAnalysis(events, from, to, roomId);
    const detail: RoomHistoryDetail = {
      ...toSummary(roomValue),
      from,
      to,
      bucketSizeMs,
      buckets: aggregateEvents(events, from, to, bucketSizeMs),
      ...analysis,
    };
    return json(200, detail);
  } catch (error: unknown) {
    console.error('History API error:', error);
    if (hasErrorMessage(error, 'invalid cursor')) return json(400, { message: 'Invalid cursor' });
    if (hasErrorMessage(error, 'too many events')) return json(413, { message: 'The selected range exceeds 10000 events' });
    return json(500, { message: 'Failed to load room history' });
  }
};
