import { describe, expect, it } from 'vitest';
import {
  createDesktopRefreshToken,
  DESKTOP_REFRESH_TTL_SECONDS,
  verifyDesktopRefreshToken,
} from './desktop-refresh.js';

describe('desktop refresh tokens', () => {
  const key = new TextEncoder().encode(
    'a-development-signing-key-that-is-long-enough-for-hs256'
  );

  it('round-trips an identity for twelve hours', async () => {
    const nowSeconds = 1_800_000_000;
    const credential = await createDesktopRefreshToken(
      key,
      { sub: 'user-1', email: 'user@example.com' },
      nowSeconds
    );

    expect(credential.refreshExpiresAt).toBe(
      (nowSeconds + DESKTOP_REFRESH_TTL_SECONDS) * 1000
    );
    await expect(
      verifyDesktopRefreshToken(
        credential.refreshToken,
        key,
        new Date((nowSeconds + 1) * 1000)
      )
    ).resolves.toEqual({ sub: 'user-1', email: 'user@example.com' });
  });

  it('rejects expired and incorrectly signed credentials', async () => {
    const nowSeconds = 1_800_000_000;
    const credential = await createDesktopRefreshToken(
      key,
      { sub: 'user-1' },
      nowSeconds
    );

    await expect(
      verifyDesktopRefreshToken(
        credential.refreshToken,
        key,
        new Date((nowSeconds + DESKTOP_REFRESH_TTL_SECONDS + 1) * 1000)
      )
    ).rejects.toThrow();
    await expect(
      verifyDesktopRefreshToken(
        credential.refreshToken,
        new TextEncoder().encode('a-different-signing-key-for-the-test'),
        new Date((nowSeconds + 1) * 1000)
      )
    ).rejects.toThrow();
  });
});
