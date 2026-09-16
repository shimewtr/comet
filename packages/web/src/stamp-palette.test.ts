import { describe, expect, it } from 'vitest';
import { useInMemoryLocalStorage } from './test-utils/local-storage';
import {
  DEFAULT_PALETTE,
  MAX_PALETTE_SIZE,
  PALETTE_HARD_LIMIT,
  clearStampPalette,
  isDefaultPalette,
  loadStampPalette,
  movePaletteEntry,
  resolvePaletteEntry,
  saveStampPalette,
} from './stamp-palette';

const STORAGE_KEY = 'comet_stamp_palette';

describe('stamp-palette', () => {
  useInMemoryLocalStorage();

  it('returns the default palette when nothing is saved', () => {
    expect(loadStampPalette()).toEqual(DEFAULT_PALETTE);
    expect(isDefaultPalette(loadStampPalette())).toBe(true);
  });

  it('round-trips a saved palette', () => {
    const palette = [
      { id: 'emoji-1f44f', name: '👏' },
      { id: 'stamp-abc', name: 'custom' },
    ];
    saveStampPalette(palette);
    expect(loadStampPalette()).toEqual(palette);
    expect(isDefaultPalette(loadStampPalette())).toBe(false);
  });

  it('falls back to the default palette for invalid data', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'emoji-1f44f' }])
    );
    expect(loadStampPalette()).toEqual(DEFAULT_PALETTE);

    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadStampPalette()).toEqual(DEFAULT_PALETTE);
  });

  it('rejects palettes with duplicate ids or too many entries', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'emoji-1f44f', name: '👏' },
        { id: 'emoji-1f44f', name: '👏' },
      ])
    );
    expect(loadStampPalette()).toEqual(DEFAULT_PALETTE);

    const tooMany = Array.from({ length: PALETTE_HARD_LIMIT + 1 }, (_, i) => ({
      id: `emoji-${i.toString(16)}`,
      name: 'x',
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tooMany));
    expect(loadStampPalette()).toEqual(DEFAULT_PALETTE);
  });

  it('keeps palettes that exceed the recommended size but not the hard limit', () => {
    const overRecommended = Array.from(
      { length: MAX_PALETTE_SIZE + 5 },
      (_, i) => ({ id: `emoji-${i.toString(16)}`, name: 'x' })
    );
    saveStampPalette(overRecommended);
    expect(loadStampPalette()).toEqual(overRecommended);
  });

  it('clears the saved palette', () => {
    saveStampPalette([{ id: 'emoji-1f44f', name: '👏' }]);
    clearStampPalette();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('moves an entry onto another entry in either direction', () => {
    const a = { id: 'a', name: 'A' };
    const b = { id: 'b', name: 'B' };
    const c = { id: 'c', name: 'C' };
    expect(movePaletteEntry([a, b, c], 'a', 'c')).toEqual([b, c, a]);
    expect(movePaletteEntry([a, b, c], 'c', 'a')).toEqual([c, a, b]);
    expect(movePaletteEntry([a, b, c], 'b', 'b')).toEqual([a, b, c]);
    expect(movePaletteEntry([a, b, c], 'x', 'a')).toEqual([a, b, c]);
  });

  it('resolves emoji entries without needing custom stamps', () => {
    expect(resolvePaletteEntry({ id: 'emoji-1f44f', name: '👏' }, [])).toEqual({
      id: 'emoji-1f44f',
      name: '👏',
      imageUrl: '',
      category: 'emotion',
    });
  });

  it('resolves custom entries from the stamp list and drops deleted ones', () => {
    const custom = {
      id: 'stamp-abc',
      name: 'yatta',
      imageUrl: 'https://example.com/a.png',
      category: 'custom' as const,
    };
    expect(
      resolvePaletteEntry({ id: 'stamp-abc', name: 'yatta' }, [custom])
    ).toBe(custom);
    expect(
      resolvePaletteEntry({ id: 'stamp-gone', name: 'gone' }, [custom])
    ).toBeNull();
  });
});
