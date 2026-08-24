import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { jwtVerify } from 'jose';

/** Cometが自前で発行する認証チケット(JWT)のissuer */
export const TICKET_ISSUER = 'comet-auth';

const secretsClient = new SecretsManagerClient({});

// warm invocation間で署名鍵をキャッシュする
let cachedKey: Uint8Array | null = null;

async function getSigningKey(): Promise<Uint8Array> {
  if (cachedKey) {
    return cachedKey;
  }

  const secretArn = process.env.AUTH_SIGNING_SECRET_ARN;
  if (!secretArn) {
    throw new Error('AUTH_SIGNING_SECRET_ARN is not set');
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  if (!result.SecretString) {
    throw new Error('Signing secret is empty');
  }

  cachedKey = new TextEncoder().encode(result.SecretString);
  return cachedKey;
}

/**
 * 認証チケット（Comet自身の鍵でHS256署名された短命JWT）を検証する。
 * 失敗時はthrowする
 */
export async function verifyTicket(
  token: string
): Promise<{ subject?: string }> {
  const key = await getSigningKey();
  const { payload } = await jwtVerify(token, key, {
    issuer: TICKET_ISSUER,
    algorithms: ['HS256'],
    clockTolerance: 30,
  });
  return { subject: payload.sub };
}
