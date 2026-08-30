import { describe, expect, it } from 'vitest';
import {
  decodeRequestBody,
  desktopCallbackURL,
  desktopEncryptionKey,
  DESKTOP_LOGOUT_CALLBACK_URL,
  isBase64Url,
  isSafeLocalPath,
  matchesPKCEChallenge,
  pkceChallenge,
} from './desktop-auth.js';

describe('desktop authentication helpers', () => {
  it('validates bounded base64url values', () => {
    expect(isBase64Url('a'.repeat(43), 43, 128)).toBe(true);
    expect(isBase64Url('a'.repeat(42), 43, 128)).toBe(false);
    expect(isBase64Url(`${'a'.repeat(42)}+`, 43, 128)).toBe(false);
  });

  it('accepts only local redirect paths', () => {
    expect(isSafeLocalPath('/rooms/global?mode=present')).toBe(true);
    expect(isSafeLocalPath('//evil.example/path')).toBe(false);
    expect(isSafeLocalPath('https://evil.example/path')).toBe(false);
    expect(isSafeLocalPath(undefined)).toBe(false);
  });

  it('matches the RFC 7636 PKCE challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    expect(pkceChallenge(verifier)).toBe(challenge);
    expect(matchesPKCEChallenge(verifier, challenge)).toBe(true);
    expect(matchesPKCEChallenge('wrong-verifier'.repeat(4), challenge)).toBe(
      false
    );
    expect(matchesPKCEChallenge(verifier, undefined)).toBe(false);
  });

  it('decodes Lambda@Edge request bodies', () => {
    const form = 'code=example&code_verifier=verifier';
    expect(decodeRequestBody({ data: form, encoding: 'text' })).toBe(form);
    expect(
      decodeRequestBody({
        data: Buffer.from(form).toString('base64'),
        encoding: 'base64',
      })
    ).toBe(form);
  });

  it('always returns the fixed callback origin and escapes values', () => {
    const callback = new URL(desktopCallbackURL('state/value', 'code+value'));

    expect(callback.protocol).toBe('comet-overlay:');
    expect(callback.host).toBe('auth');
    expect(callback.pathname).toBe('/callback');
    expect(callback.searchParams.get('state')).toBe('state/value');
    expect(callback.searchParams.get('code')).toBe('code+value');
  });

  it('uses fixed desktop callback URLs and a domain-separated encryption key', () => {
    expect(DESKTOP_LOGOUT_CALLBACK_URL).toBe('comet-overlay://auth/logout');
    expect(desktopEncryptionKey(Buffer.from('secret'))).toHaveLength(32);
    expect(desktopEncryptionKey(Buffer.from('secret'))).not.toEqual(
      Buffer.from('secret')
    );
  });
});
