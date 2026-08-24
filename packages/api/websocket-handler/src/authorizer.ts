import {
  APIGatewayRequestAuthorizerHandler,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';
import { verifyTicket } from './auth';

function policyResult(
  effect: 'Allow' | 'Deny',
  resource: string,
  principalId: string
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
}

/**
 * WebSocket $connect用のRequestオーソライザー
 * 接続クエリの ?token= に載った認証チケットを検証する
 */
export const wsAuthorizer: APIGatewayRequestAuthorizerHandler = async (
  event
) => {
  const token = event.queryStringParameters?.token;

  try {
    if (!token) {
      throw new Error('Missing token');
    }
    const { subject } = await verifyTicket(token);
    return policyResult('Allow', event.methodArn, subject ?? 'unknown');
  } catch (error) {
    console.warn('WebSocket authorization failed:', error);
    return policyResult('Deny', event.methodArn, 'unauthorized');
  }
};

interface HttpAuthorizerEvent {
  headers?: Record<string, string | undefined>;
}

interface HttpSimpleAuthorizerResult {
  isAuthorized: boolean;
}

/**
 * スタンプAPI（HTTP API）用のLambdaオーソライザー（simpleレスポンス）
 * Authorization: Bearer に載った認証チケットを検証する
 */
export const httpAuthorizer = async (
  event: HttpAuthorizerEvent
): Promise<HttpSimpleAuthorizerResult> => {
  const authHeader = event.headers?.authorization ?? event.headers?.Authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : undefined;

  try {
    if (!token) {
      throw new Error('Missing bearer token');
    }
    await verifyTicket(token);
    return { isAuthorized: true };
  } catch (error) {
    console.warn('HTTP API authorization failed:', error);
    return { isAuthorized: false };
  }
};
