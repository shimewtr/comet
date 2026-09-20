import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TICKET_TTL_SECONDS,
  createAccessTicket,
  DESKTOP_ACCESS_TICKET_TTL_SECONDS,
} from './access-ticket.js';

describe('access tickets', () => {
  const key = new TextEncoder().encode(
    'a-development-signing-key-that-is-long-enough-for-hs256'
  );
  const nowMilliseconds = 1_800_000_000_500;

  it.each([
    ['web and extension', ACCESS_TICKET_TTL_SECONDS],
    ['macOS', DESKTOP_ACCESS_TICKET_TTL_SECONDS],
  ])('uses the configured lifetime for %s', async (_client, ttlSeconds) => {
    const ticket = await createAccessTicket(
      key,
      { sub: 'user-1' },
      ttlSeconds,
      nowMilliseconds
    );

    expect(ticket.expiresAt).toBe(
      (Math.floor(nowMilliseconds / 1000) + ttlSeconds) * 1000
    );
    const claims = decodeJwt(ticket.token);
    expect(claims.iat).toBe(Math.floor(nowMilliseconds / 1000));
    expect(claims.exp).toBe(claims.iat! + ttlSeconds);
  });
});
