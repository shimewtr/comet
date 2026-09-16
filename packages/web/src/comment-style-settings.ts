import type { CommentAnimation, CommentSize, SpeedOption } from '@comet/shared';
import {
  COMMENT_ANIMATIONS,
  COMMENT_COLORS,
  COMMENT_SIZE_OPTIONS,
  SPEED_OPTIONS,
} from '@comet/shared';

const STORAGE_KEY = 'comet_comment_style_settings';

export interface CommentStyleSettings {
  color: string;
  size: CommentSize;
  speedOption: SpeedOption;
  animation: CommentAnimation;
}

const COLOR_VALUES: readonly string[] = Object.values(COMMENT_COLORS);

function isCommentStyleSettings(value: unknown): value is CommentStyleSettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.color === 'string' &&
    COLOR_VALUES.includes(settings.color) &&
    (COMMENT_SIZE_OPTIONS as readonly string[]).includes(
      settings.size as string
    ) &&
    (SPEED_OPTIONS as readonly string[]).includes(
      settings.speedOption as string
    ) &&
    (COMMENT_ANIMATIONS as readonly string[]).includes(
      settings.animation as string
    )
  );
}

export function loadCommentStyleSettings(): CommentStyleSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCommentStyleSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCommentStyleSettings(settings: CommentStyleSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage が使えなくてもコメント送信は続ける。
  }
}

export function clearCommentStyleSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage が使えない環境では何もしない。
  }
}
