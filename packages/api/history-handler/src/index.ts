import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import type {
  RoomEvent,
  RoomHistoryDetail,
} from '@comet/shared';
import { toSummary } from './formatters.js';
import { getCaptures } from './capture-repository.js';
import { queryAllEvents, queryEventsPage } from './event-repository.js';
import { getRoom } from './room-repository.js';
import {
  aggregateEvents,
  bucketSizeFor,
  selectPeaks,
  summarizeMetrics,
} from './history-summary.js';
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
const capturesTable = process.env.ROOM_CAPTURES_TABLE_NAME!;
const captureBucket = process.env.CAPTURE_BUCKET_NAME!;
const s3 = new S3Client({});

function hasErrorName(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function hasErrorMessage(error: unknown, message: string): boolean {
  return error instanceof Error && error.message === message;
}

async function buildAnalysis(events: RoomEvent[], from: number, to: number, roomId: string) {
  const minuteBuckets = aggregateEvents(events, from, to, 60_000).filter((bucket) => bucket.totalCount > 0);
  const selected = selectPeaks(minuteBuckets);
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
  return {
    peaks,
    captures: signedCaptures,
    metrics: summarizeMetrics(events, from, to, minuteBuckets, peaks),
  };
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
      const result = await queryEventsPage(
        roomId,
        from,
        to,
        limit,
        decodeCursor(event.queryStringParameters?.cursor)
      );
      return json(200, {
        events: result.events,
        cursor: encodeCursor(result.cursor),
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
