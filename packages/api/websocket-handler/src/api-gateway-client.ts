import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

/**
 * API Gateway Management APIクライアント
 */
export function createApiGatewayClient(endpoint: string) {
  return new ApiGatewayManagementApiClient({
    endpoint,
  });
}

/**
 * 特定の接続にメッセージを送信
 */
export async function sendMessageToConnection(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  data: any
): Promise<boolean> {
  try {
    const command = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(data)),
    });

    await client.send(command);
    return true;
  } catch (error: any) {
    // 接続が既に切断されている場合
    if (error.statusCode === 410) {
      console.log(`Connection ${connectionId} is gone`);
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
  data: any
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  await Promise.all(
    connectionIds.map(async (connectionId) => {
      const success = await sendMessageToConnection(client, connectionId, data);
      if (success) {
        sent++;
      } else {
        failed++;
      }
    })
  );

  return { sent, failed };
}
