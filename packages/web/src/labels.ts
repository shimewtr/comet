import type { CommentAnimation, CommentSize, SpeedOption } from '@comet/shared';
import { COMMENT_COLORS } from '@comet/shared';

/**
 * コメントのスタイル選択肢に表示する日本語ラベル
 * 値そのものは @comet/shared の定義を使い、ここでは表示名だけを持つ
 */

export const SIZE_LABELS: Record<CommentSize, string> = {
  small: '小',
  medium: '中',
  large: '大',
};

export const SPEED_LABELS: Record<SpeedOption, string> = {
  slow: '遅い',
  normal: '普通',
  fast: '速い',
};

export const ANIMATION_LABELS: Record<CommentAnimation, string> = {
  none: 'なし',
  blink: '点滅',
  bounce: 'バウンド',
  shake: '揺れ',
};

export const COLOR_LABELS: Record<keyof typeof COMMENT_COLORS, string> = {
  WHITE: '白',
  BLACK: '黒',
  RED: '赤',
  PINK: 'ピンク',
  ORANGE: 'オレンジ',
  YELLOW: '黄',
  GREEN: '緑',
  CYAN: '水色',
  BLUE: '青',
  PURPLE: '紫',
};
