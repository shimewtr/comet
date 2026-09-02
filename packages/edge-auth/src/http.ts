import type { CloudFrontHeaders, CloudFrontRequestResult } from 'aws-lambda';

export function parseCookies(headers: CloudFrontHeaders): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of headers.cookie ?? []) {
    for (const part of header.value.split(';')) {
      const index = part.indexOf('=');
      if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  }
  return cookies;
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearCookie(name: string): string { return cookie(name, '', 0); }

export function redirect(location: string, setCookies: string[] = []): CloudFrontRequestResult {
  return {
    status: '302', statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: location }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-store' }],
      ...(setCookies.length > 0 ? { 'set-cookie': setCookies.map((value) => ({ key: 'Set-Cookie', value })) } : {}),
    },
  };
}

export function jsonResponse(status: number, body: unknown, setCookies: string[] = []): CloudFrontRequestResult {
  return {
    status: String(status),
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'application/json' }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-store' }],
      ...(setCookies.length > 0 ? { 'set-cookie': setCookies.map((value) => ({ key: 'Set-Cookie', value })) } : {}),
    },
    body: JSON.stringify(body),
  };
}
