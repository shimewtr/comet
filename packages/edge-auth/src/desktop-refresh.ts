import { SignJWT, jwtVerify } from 'jose';

export const DESKTOP_REFRESH_TTL_SECONDS = 12 * 60 * 60;
export const DESKTOP_REFRESH_ISSUER = 'comet-desktop-refresh';
export const DESKTOP_REFRESH_AUDIENCE = 'comet-desktop-app';

export interface DesktopRefreshIdentity {
  sub: string;
  email?: string;
}

export async function createDesktopRefreshToken(
  key: Uint8Array,
  identity: DesktopRefreshIdentity,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<{ refreshToken: string; refreshExpiresAt: number }> {
  const refreshExpiresAtSeconds = nowSeconds + DESKTOP_REFRESH_TTL_SECONDS;
  const refreshToken = await new SignJWT({ email: identity.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.sub)
    .setIssuer(DESKTOP_REFRESH_ISSUER)
    .setAudience(DESKTOP_REFRESH_AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(refreshExpiresAtSeconds)
    .sign(key);
  return {
    refreshToken,
    refreshExpiresAt: refreshExpiresAtSeconds * 1000,
  };
}

export async function verifyDesktopRefreshToken(
  token: string,
  key: Uint8Array,
  currentDate = new Date()
): Promise<DesktopRefreshIdentity> {
  const { payload } = await jwtVerify(token, key, {
    issuer: DESKTOP_REFRESH_ISSUER,
    audience: DESKTOP_REFRESH_AUDIENCE,
    algorithms: ['HS256'],
    currentDate,
  });
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Desktop refresh token subject is missing');
  }
  return {
    sub: payload.sub,
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
  };
}
