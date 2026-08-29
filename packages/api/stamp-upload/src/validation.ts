export const MAX_FILE_SIZE = 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]);

export interface GeneratePresignedUrlRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  stampName?: string;
}

export type UploadRequestResult =
  | { ok: true; value: GeneratePresignedUrlRequest }
  | { ok: false; error: string };

export function parseUploadRequest(body: string): UploadRequestResult {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, error: 'Request body must be valid JSON' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Request body must be an object' };
  }

  const request = value as Record<string, unknown>;
  if (
    typeof request.fileName !== 'string' ||
    !request.fileName.trim() ||
    typeof request.fileType !== 'string' ||
    !request.fileType.trim() ||
    typeof request.fileSize !== 'number'
  ) {
    return {
      ok: false,
      error: 'fileName, fileType, and fileSize are required',
    };
  }

  if (!Number.isFinite(request.fileSize) || request.fileSize <= 0) {
    return { ok: false, error: 'fileSize must be a positive number' };
  }
  if (request.fileSize > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }
  if (!ALLOWED_FILE_TYPES.has(request.fileType)) {
    return {
      ok: false,
      error: 'Invalid file type. Only PNG, JPG, and GIF are allowed',
    };
  }
  if (
    request.stampName !== undefined &&
    typeof request.stampName !== 'string'
  ) {
    return { ok: false, error: 'stampName must be a string' };
  }

  return {
    ok: true,
    value: {
      fileName: request.fileName.trim(),
      fileType: request.fileType,
      fileSize: request.fileSize,
      ...(request.stampName !== undefined
        ? { stampName: request.stampName.trim() }
        : {}),
    },
  };
}

export function stampNameFor(request: GeneratePresignedUrlRequest): string {
  return request.stampName || request.fileName.replace(/\.[^/.]+$/, '');
}
