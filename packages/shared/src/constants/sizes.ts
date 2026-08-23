import { CommentSize } from '../types/index.js';

/**
 * コメントサイズの選択肢
 */
export const COMMENT_SIZE_OPTIONS: readonly CommentSize[] = [
  'small',
  'medium',
  'large',
] as const;

/**
 * コメントサイズの設定値（ピクセル）
 */
export const COMMENT_SIZES: Record<CommentSize, number> = {
  small: 60,
  medium: 90,
  large: 120,
} as const;

/**
 * 速度オプション
 */
export type SpeedOption = 'slow' | 'normal' | 'fast';

/**
 * 速度の選択肢
 */
export const SPEED_OPTIONS: readonly SpeedOption[] = [
  'slow',
  'normal',
  'fast',
] as const;

/**
 * 速度の設定値
 */
export const SPEED_VALUES: Record<SpeedOption, number> = {
  slow: 3,
  normal: 4,
  fast: 6,
} as const;

