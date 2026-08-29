import { createHash, timingSafeEqual } from 'node:crypto';

export const DESKTOP_CALLBACK_URL = 'comet-overlay://auth/callback';
export const DESKTOP_LOGOUT_CALLBACK_URL = 'comet-overlay://auth/logout';

export function isBase64Url(
  value: string,
  minimumLength: number,
  maximumLength: number
): boolean {
  return (
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function isSafeLocalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
  );
}

export function decodeRequestBody(body?: {
  data?: string;
  encoding?: string;
}): string {
  if (!body?.data) return '';
  return Buffer.from(
    body.data,
    body.encoding === 'base64' ? 'base64' : 'utf8'
  ).toString('utf8');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function desktopEncryptionKey(signingKey: Uint8Array): Buffer {
  return createHash('sha256')
    .update('comet-desktop-authorization-code-v1\0')
    .update(signingKey)
    .digest();
}

export function matchesPKCEChallenge(
  verifier: string,
  expectedChallenge: unknown
): boolean {
  if (typeof expectedChallenge !== 'string') return false;
  const actualChallenge = pkceChallenge(verifier);
  return (
    expectedChallenge.length === actualChallenge.length &&
    timingSafeEqual(
      Buffer.from(expectedChallenge),
      Buffer.from(actualChallenge)
    )
  );
}

export function desktopCallbackURL(state: string, code: string): string {
  const callback = new URL(DESKTOP_CALLBACK_URL);
  callback.searchParams.set('state', state);
  callback.searchParams.set('code', code);
  return callback.toString();
}
