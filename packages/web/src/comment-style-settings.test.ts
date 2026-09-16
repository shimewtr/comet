import { describe, expect, it } from 'vitest';
import { useInMemoryLocalStorage } from './test-utils/local-storage';
import {
  clearCommentStyleSettings,
  loadCommentStyleSettings,
  saveCommentStyleSettings,
} from './comment-style-settings';

const STORAGE_KEY = 'comet_comment_style_settings';

describe('comment-style-settings', () => {
  useInMemoryLocalStorage();

  it('round-trips valid settings', () => {
    const settings = {
      color: '#FF0000',
      size: 'large' as const,
      speedOption: 'fast' as const,
      animation: 'bounce' as const,
    };
    saveCommentStyleSettings(settings);
    expect(loadCommentStyleSettings()).toEqual(settings);
  });

  it('rejects values outside the current options', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        color: '#123456',
        size: 'large',
        speedOption: 'fast',
        animation: 'bounce',
      })
    );
    expect(loadCommentStyleSettings()).toBeNull();
  });

  it('clears saved settings', () => {
    saveCommentStyleSettings({
      color: '#FF0000',
      size: 'small',
      speedOption: 'slow',
      animation: 'none',
    });
    clearCommentStyleSettings();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
