import { describe, expect, it } from 'vitest';
import { clearCookie, jsonResponse, parseCookies, redirect } from './http.js';

describe('CloudFront HTTP helpers', () => {
  it('parses multiple cookie headers without losing values that contain equals', () => {
    expect(parseCookies({ cookie: [{ key: 'Cookie', value: 'a=1; token=a=b' }, { key: 'Cookie', value: 'b=2' }] })).toEqual({ a: '1', token: 'a=b', b: '2' });
  });
  it('uses no-store redirects and secure cleared cookies', () => {
    const response = redirect('https://example.com', [clearCookie('session')]);
    expect(response.headers.location[0].value).toBe('https://example.com');
    expect(response.headers['set-cookie'][0].value).toContain('Max-Age=0');
  });
  it('serializes JSON error responses with the correct CloudFront headers', () => {
    const response = jsonResponse(401, { error: 'Nope' });
    expect(response.status).toBe('401');
    expect(response.headers['cache-control'][0].value).toBe('no-store');
    expect(response.body).toBe('{"error":"Nope"}');
  });
});
