import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { removeConnection } from './repositories/connections';

/**
 * エンドポイントごとのクライアントキャッシュ
 * warm invocation間でTLS接続(keep-alive)を再利用するため、
 * リクエストごとに生成せずモジュールレベルで保持する
 */
const clientCache = new Map<string, ApiGatewayManagementApiClient>();

function isGoneConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as {
    statusCode?: number;
    $metadata?: { httpStatusCode?: number };
  };
  return value.statusCode === 410 || value.$metadata?.httpStatusCode === 410;
}

/**
 * API Gateway Management APIクライアント
 */
export function createApiGatewayClient(
  endpoint: string
): ApiGatewayManagementApiClient {
  const cached = clientCache.get(endpoint);
  if (cached) {
    return cached;
  }

  const client = new ApiGatewayManagementApiClient({
    endpoint,
  });
  clientCache.set(endpoint, client);
  return client;
}

/**
 * 特定の接続にシリアライズ済みメッセージを送信
 */
export async function sendMessageToConnection(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  data: Uint8Array
): Promise<boolean> {
  try {
    const command = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: data,
    });

    await client.send(command);
    return true;
  } catch (error: unknown) {
    // 接続が既に切断されている場合
    if (isGoneConnectionError(error)) {
      console.log(`Connection ${connectionId} is gone, removing from database`);
      // DynamoDBから削除
      try {
        await removeConnection(connectionId);
      } catch (dbError) {
        console.error(`Failed to remove connection ${connectionId}:`, dbError);
      }
      return false;
    }
    console.error(`Error sending message to ${connectionId}:`, error);
    throw error;
  }
}

/**
 * 複数の接続にメッセージをブロードキャスト
 */
export async function broadcastMessage(
  client: ApiGatewayManagementApiClient,
  connectionIds: string[],
  data: unknown
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // シリアライズは接続数に関わらず1回だけ行う
  const encoded = Buffer.from(JSON.stringify(data));

  await Promise.all(
    connectionIds.map(async (connectionId) => {
      const success = await sendMessageToConnection(
        client,
        connectionId,
        encoded
      );
      if (success) {
        sent++;
      } else {
        failed++;
      }
    })
  );

  return { sent, failed };
}
