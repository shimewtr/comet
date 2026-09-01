import type { AttributeValue } from '@aws-sdk/client-dynamodb';

export interface HistoryRequestQuery {
  limit?: string;
  cursor?: string;
  from?: string;
  to?: string;
}

export const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  },
  body: JSON.stringify(body),
});

export function parseBoundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(Math.max(Number(value) || fallback, minimum), maximum);
}

export function parseRange(
  query: HistoryRequestQuery,
  defaultFrom: number,
  defaultTo: number
): { from: number; to: number } {
  return {
    from: Number(query.from) || defaultFrom,
    to: Number(query.to) || defaultTo,
  };
}

export function encodeCursor(
  key?: Record<string, AttributeValue>
): string | undefined {
  return key
    ? Buffer.from(JSON.stringify(key)).toString('base64url')
    : undefined;
}

export function decodeCursor(
  value?: string
): Record<string, AttributeValue> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid cursor');
  }
}

export function parseJsonBody(body: string | undefined): Record<string, unknown> {
  const value: unknown = JSON.parse(body ?? '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid request body');
  }
  return value as Record<string, unknown>;
}
