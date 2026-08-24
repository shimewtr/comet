/**
 * CloudFrontのviewer-requestで動くOIDC認証Lambda@Edge
 *
 * - セッションCookieがなければIdP（Okta等の任意のOIDCプロバイダ）へ
 *   認可コード+PKCEでリダイレクトし、/auth/callback でセッションCookieを発行する
 * - /auth/token ではセッションを確認のうえ、Comet自身の鍵で署名した
 *   短命チケット(JWT)を発行する。バックエンドのオーソライザーはこのチケットだけを検証する
 *
 * Lambda@Edgeは環境変数を使えないため、設定はCDKがアセットに同梱する config.json から読む
 */
import type {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  CloudFrontHeaders,
} from 'aws-lambda';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

interface EdgeConfig {
  issuer: string;
  clientId: string;
  signingSecretName: string;
  signingSecretRegion: string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config: EdgeConfig = require('./config.json');

const SESSION_COOKIE = 'comet_session';
const TXN_COOKIE = 'comet_txn';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const TXN_TTL_SECONDS = 10 * 60;
const TICKET_TTL_SECONDS = 15 * 60;

const SESSION_ISSUER = 'comet-session';
const TXN_ISSUER = 'comet-txn';
// websocket-handler側のTICKET_ISSUERと一致させること
const TICKET_ISSUER = 'comet-auth';

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

// コールドスタート間で使い回すキャッシュ
let cachedSigningKey: Uint8Array | null = null;
let cachedDiscovery: OidcDiscovery | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function getSigningKey(): Promise<Uint8Array> {
  if (cachedSigningKey) {
    return cachedSigningKey;
  }
  const client = new SecretsManagerClient({
    region: config.signingSecretRegion,
  });
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: config.signingSecretName })
  );
  if (!result.SecretString) {
    throw new Error('Signing secret is empty');
  }
  cachedSigningKey = new TextEncoder().encode(result.SecretString);
  return cachedSigningKey;
}

async function getDiscovery(): Promise<OidcDiscovery> {
  if (cachedDiscovery) {
    return cachedDiscovery;
  }
  const url = `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: ${response.status}`);
  }
  cachedDiscovery = (await response.json()) as OidcDiscovery;
  return cachedDiscovery;
}

function getJwks(discovery: OidcDiscovery) {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  }
  return cachedJwks;
}

// ---- ユーティリティ ----

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function parseCookies(headers: CloudFrontHeaders): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of headers.cookie ?? []) {
    for (const part of header.value.split(';')) {
      const index = part.indexOf('=');
      if (index > 0) {
        cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
      }
    }
  }
  return cookies;
}

function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Lax`;
}

function clearCookie(name: string): string {
  return cookie(name, '', 0);
}

function redirect(
  location: string,
  setCookies: string[] = []
): CloudFrontRequestResult {
  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: location }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-store' }],
      ...(setCookies.length > 0
        ? { 'set-cookie': setCookies.map((value) => ({ key: 'Set-Cookie', value })) }
        : {}),
    },
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  setCookies: string[] = []
): CloudFrontRequestResult {
  return {
    status: String(status),
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'application/json' }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-store' }],
      ...(setCookies.length > 0
        ? { 'set-cookie': setCookies.map((value) => ({ key: 'Set-Cookie', value })) }
        : {}),
    },
    body: JSON.stringify(body),
  };
}

// ---- 認証フロー ----

/**
 * IdPへのログインリダイレクトを開始する
 * PKCEのverifier等は署名付きの一時Cookieに保存して往復させる
 */
async function startLogin(
  host: string,
  destinationPath: string
): Promise<CloudFrontRequestResult> {
  const discovery = await getDiscovery();
  const key = await getSigningKey();

  const state = base64url(randomBytes(16));
  const nonce = base64url(randomBytes(16));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(
    createHash('sha256').update(verifier).digest()
  );

  const txn = await new SignJWT({ state, nonce, verifier, dest: destinationPath })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(TXN_ISSUER)
    .setExpirationTime(`${TXN_TTL_SECONDS}s`)
    .sign(key);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: `https://${host}/auth/callback`,
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return redirect(`${discovery.authorization_endpoint}?${params.toString()}`, [
    cookie(TXN_COOKIE, txn, TXN_TTL_SECONDS),
  ]);
}

/**
 * IdPからのコールバック: コード交換とIDトークン検証を行い、セッションCookieを発行する
 */
async function handleCallback(
  host: string,
  querystring: string,
  cookies: Record<string, string>
): Promise<CloudFrontRequestResult> {
  const key = await getSigningKey();
  const query = new URLSearchParams(querystring);
  const code = query.get('code');
  const state = query.get('state');
  const txnToken = cookies[TXN_COOKIE];

  if (!code || !state || !txnToken) {
    return jsonResponse(400, { error: 'Invalid callback request' });
  }

  // 一時Cookie（自前署名）を検証してPKCE verifier等を取り出す
  let txn: { state?: string; nonce?: string; verifier?: string; dest?: string };
  try {
    const { payload } = await jwtVerify(txnToken, key, {
      issuer: TXN_ISSUER,
      algorithms: ['HS256'],
    });
    txn = payload as typeof txn;
  } catch {
    return jsonResponse(400, { error: 'Login session expired. Please retry.' });
  }

  if (txn.state !== state) {
    return jsonResponse(400, { error: 'State mismatch' });
  }

  // 認可コードをトークンに交換
  const discovery = await getDiscovery();
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `https://${host}/auth/callback`,
      client_id: config.clientId,
      code_verifier: txn.verifier ?? '',
    }),
  });

  if (!tokenResponse.ok) {
    console.error('Token exchange failed:', await tokenResponse.text());
    return jsonResponse(401, { error: 'Token exchange failed' });
  }

  const tokens = (await tokenResponse.json()) as { id_token?: string };
  if (!tokens.id_token) {
    return jsonResponse(401, { error: 'No id_token in response' });
  }

  // IDトークンをIdPのJWKSで検証する
  let claims: { sub?: string; email?: string; nonce?: string };
  try {
    const { payload } = await jwtVerify(tokens.id_token, getJwks(discovery), {
      issuer: config.issuer,
      audience: config.clientId,
    });
    claims = payload as typeof claims;
  } catch (error) {
    console.error('ID token verification failed:', error);
    return jsonResponse(401, { error: 'Invalid ID token' });
  }

  if (claims.nonce !== txn.nonce) {
    return jsonResponse(401, { error: 'Nonce mismatch' });
  }

  // セッションCookie（自前署名JWT）を発行して元のページへ戻す
  const session = await new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub ?? 'unknown')
    .setIssuer(SESSION_ISSUER)
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);

  const dest = txn.dest && txn.dest.startsWith('/') ? txn.dest : '/';
  return redirect(`https://${host}${dest}`, [
    cookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS),
    clearCookie(TXN_COOKIE),
  ]);
}

/**
 * セッションCookieを検証する。無効ならnull
 */
async function verifySession(
  cookies: Record<string, string>
): Promise<{ sub: string; email?: string } | null> {
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  try {
    const key = await getSigningKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: SESSION_ISSUER,
      algorithms: ['HS256'],
    });
    return { sub: payload.sub ?? 'unknown', email: payload.email as string };
  } catch {
    return null;
  }
}

/**
 * WebSocket/API用の短命チケットを発行する
 */
async function issueTicket(session: {
  sub: string;
  email?: string;
}): Promise<CloudFrontRequestResult> {
  const key = await getSigningKey();
  const expiresAt = Date.now() + TICKET_TTL_SECONDS * 1000;

  const token = await new SignJWT({ email: session.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.sub)
    .setIssuer(TICKET_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .sign(key);

  return jsonResponse(200, { token, expiresAt });
}

// ---- エントリーポイント ----

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequestResult> => {
  const request = event.Records[0].cf.request;
  const host = request.headers.host?.[0]?.value ?? '';
  const cookies = parseCookies(request.headers);

  try {
    if (request.uri === '/auth/callback') {
      return await handleCallback(host, request.querystring, cookies);
    }

    if (request.uri === '/auth/logout') {
      return redirect(`https://${host}/`, [clearCookie(SESSION_COOKIE)]);
    }

    const session = await verifySession(cookies);

    if (request.uri === '/auth/token') {
      if (!session) {
        return jsonResponse(401, { error: 'Not authenticated' });
      }
      return await issueTicket(session);
    }

    if (session) {
      // 認証済み: そのままオリジンへ
      return request;
    }

    return await startLogin(host, `${request.uri}${request.querystring ? `?${request.querystring}` : ''}`);
  } catch (error) {
    console.error('Edge auth error:', error);
    return jsonResponse(500, { error: 'Authentication error' });
  }
};
