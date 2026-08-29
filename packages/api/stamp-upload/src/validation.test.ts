import { describe, expect, it } from 'vitest';
import { MAX_FILE_SIZE, parseUploadRequest, stampNameFor } from './validation';

describe('parseUploadRequest', () => {
  it('accepts and normalizes a valid image request', () => {
    const result = parseUploadRequest(
      JSON.stringify({
        fileName: ' stamp.png ',
        fileType: 'image/png',
        fileSize: 1024,
        stampName: ' hello ',
      })
    );

    expect(result).toEqual({
      ok: true,
      value: {
        fileName: 'stamp.png',
        fileType: 'image/png',
        fileSize: 1024,
        stampName: 'hello',
      },
    });
  });

  it('rejects malformed JSON and non-object bodies', () => {
    expect(parseUploadRequest('{ invalid')).toEqual({
      ok: false,
      error: 'Request body must be valid JSON',
    });
    expect(parseUploadRequest('[]')).toEqual({
      ok: false,
      error: 'Request body must be an object',
    });
  });

  it('rejects missing required values', () => {
    expect(
      parseUploadRequest(JSON.stringify({ fileName: 'stamp.png' }))
    ).toEqual({
      ok: false,
      error: 'fileName, fileType, and fileSize are required',
    });
  });

  it('rejects non-positive and oversized files', () => {
    const request = { fileName: 'stamp.png', fileType: 'image/png' };
    expect(
      parseUploadRequest(JSON.stringify({ ...request, fileSize: -1 }))
    ).toEqual({
      ok: false,
      error: 'fileSize must be a positive number',
    });
    expect(
      parseUploadRequest(
        JSON.stringify({ ...request, fileSize: MAX_FILE_SIZE + 1 })
      )
    ).toEqual({
      ok: false,
      error: 'File size exceeds maximum allowed size of 1MB',
    });
  });

  it('rejects unsupported file types and invalid stamp names', () => {
    expect(
      parseUploadRequest(
        JSON.stringify({
          fileName: 'stamp.svg',
          fileType: 'image/svg+xml',
          fileSize: 1024,
        })
      )
    ).toEqual({
      ok: false,
      error: 'Invalid file type. Only PNG, JPG, and GIF are allowed',
    });
    expect(
      parseUploadRequest(
        JSON.stringify({
          fileName: 'stamp.png',
          fileType: 'image/png',
          fileSize: 1024,
          stampName: 123,
        })
      )
    ).toEqual({ ok: false, error: 'stampName must be a string' });
  });
});

describe('stampNameFor', () => {
  it('uses the custom name or falls back to the file name', () => {
    expect(
      stampNameFor({
        fileName: 'stamp.png',
        fileType: 'image/png',
        fileSize: 100,
        stampName: 'custom',
      })
    ).toBe('custom');
    expect(
      stampNameFor({
        fileName: 'stamp.png',
        fileType: 'image/png',
        fileSize: 100,
      })
    ).toBe('stamp');
  });
});
