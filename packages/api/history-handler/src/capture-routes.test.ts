import { describe, expect, it, vi } from 'vitest';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { handleCaptureRoute } from './capture-routes';

const dependencies = () => ({
  client: { send: vi.fn().mockResolvedValue({}) },
  s3: { send: vi.fn().mockResolvedValue({}) },
  roomsTable: 'rooms',
  capturesTable: 'captures',
  captureBucket: 'bucket',
});

describe('handleCaptureRoute', () => {
  it('leaves unrelated POST paths for the main handler', async () => {
    await expect(handleCaptureRoute('/rooms/room-1/unknown', 'room-1', undefined, dependencies())).resolves.toBeUndefined();
  });

  it('rejects a recorder request without a device ID', async () => {
    await expect(handleCaptureRoute('/rooms/room-1/recorder', 'room-1', '{}', dependencies())).resolves.toMatchObject({ statusCode: 400 });
  });

  it('acquires a recorder lock with a bounded expiry', async () => {
    const value = dependencies();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    await expect(handleCaptureRoute('/rooms/room-1/recorder', 'room-1', '{"deviceId":"device-1"}', value)).resolves.toMatchObject({ statusCode: 200, body: expect.stringContaining('121000') });
    expect(value.client.send).toHaveBeenCalledWith(expect.any(UpdateItemCommand));
    vi.restoreAllMocks();
  });

  it('rejects a capture without an image payload before touching AWS', async () => {
    const value = dependencies();
    await expect(handleCaptureRoute('/rooms/room-1/captures', 'room-1', '{"deviceId":"device-1"}', value)).resolves.toMatchObject({ statusCode: 400 });
    expect(value.client.send).not.toHaveBeenCalled();
    expect(value.s3.send).not.toHaveBeenCalled();
  });
});
