import { PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { marshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import { getRoom } from './room-repository.js';
import { json, parseJsonBody } from './http.js';

export async function handleCaptureRoute(
  path: string,
  roomId: string,
  body: string | undefined,
  dependencies: {
    client: { send(command: UpdateItemCommand | PutItemCommand): Promise<unknown> };
    s3: { send(command: PutObjectCommand): Promise<unknown> };
    roomsTable: string;
    capturesTable: string;
    captureBucket: string;
  }
) {
  if (path.endsWith('/recorder')) return acquireRecorder(roomId, body, dependencies);
  if (path.endsWith('/captures')) return saveCapture(roomId, body, dependencies);
  return undefined;
}

async function acquireRecorder(roomId: string, body: string | undefined, dependencies: Parameters<typeof handleCaptureRoute>[3]) {
  const payload = parseJsonBody(body);
  if (typeof payload.deviceId !== 'string' || !payload.deviceId) return json(400, { message: 'deviceId is required' });
  const now = Date.now();
  try {
    await dependencies.client.send(new UpdateItemCommand({ TableName: dependencies.roomsTable, Key: marshall({ id: roomId }), UpdateExpression: 'SET recorderId = :deviceId, recorderExpiresAt = :expiresAt', ConditionExpression: 'attribute_exists(id) AND expiresAt > :now AND (attribute_not_exists(recorderId) OR recorderId = :deviceId OR recorderExpiresAt < :now)', ExpressionAttributeValues: marshall({ ':deviceId': payload.deviceId, ':expiresAt': now + 120_000, ':now': now }) }));
    return json(200, { acquired: true, expiresAt: now + 120_000 });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return json(409, { acquired: false });
    throw error;
  }
}

async function saveCapture(roomId: string, body: string | undefined, dependencies: Parameters<typeof handleCaptureRoute>[3]) {
  const payload = parseJsonBody(body);
  if (typeof payload.deviceId !== 'string' || typeof payload.dataUrl !== 'string') return json(400, { message: 'deviceId and dataUrl are required' });
  const match = payload.dataUrl.match(/^data:image\/(jpeg|png);base64,(.+)$/);
  if (!match) return json(400, { message: 'JPEG or PNG image is required' });
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 2 * 1024 * 1024) return json(413, { message: 'Capture exceeds 2MB' });
  const room = await getRoom(roomId);
  if (!room || room.expiresAt <= Date.now() || room.recorderId !== payload.deviceId || room.recorderExpiresAt < Date.now()) return json(409, { message: 'Recorder lock is not active' });
  const capturedAt = Math.min(Math.max(Number(payload.capturedAt) || Date.now(), Date.now() - 60_000), Date.now() + 5_000);
  const captureId = randomUUID();
  const extension = match[1] === 'png' ? 'png' : 'jpg';
  const s3Key = `${roomId}/${String(capturedAt).padStart(13, '0')}-${captureId}.${extension}`;
  await dependencies.s3.send(new PutObjectCommand({ Bucket: dependencies.captureBucket, Key: s3Key, Body: bytes, ContentType: `image/${match[1]}` }));
  await dependencies.client.send(new PutItemCommand({ TableName: dependencies.capturesTable, Item: marshall({ roomId, sk: `${String(capturedAt).padStart(13, '0')}#${captureId}`, capturedAt, s3Key, ttl: Math.floor((capturedAt + 90 * 24 * 60 * 60 * 1000) / 1000) }) }));
  return json(201, { capturedAt });
}
