import { SignJWT } from 'jose';

export const ACCESS_TICKET_TTL_SECONDS = 15 * 60;
export const DESKTOP_ACCESS_TICKET_TTL_SECONDS = 60 * 60;
export const ACCESS_TICKET_ISSUER = 'comet-auth';

export interface AccessTicketIdentity {
  sub: string;
  email?: string;
}

export async function createAccessTicket(
  key: Uint8Array,
  identity: AccessTicketIdentity,
  ttlSeconds: number,
  nowMilliseconds = Date.now()
): Promise<{ token: string; expiresAt: number }> {
  const issuedAt = Math.floor(nowMilliseconds / 1000);
  const expiresAtSeconds = issuedAt + ttlSeconds;
  const token = await new SignJWT({ email: identity.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.sub)
    .setIssuer(ACCESS_TICKET_ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .sign(key);
  return { token, expiresAt: expiresAtSeconds * 1000 };
}
