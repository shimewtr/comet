/**
 * コメントに使用できる色の定義
 */
export const COMMENT_COLORS = {
  WHITE: '#FFFFFF',
  BLACK: '#000000',
  RED: '#FF0000',
  PINK: '#FF8080',
  ORANGE: '#FFA500',
  YELLOW: '#FFFF00',
  GREEN: '#00FF00',
  CYAN: '#00FFFF',
  BLUE: '#0000FF',
  PURPLE: '#C000FF',
} as const;

export type CommentColor = (typeof COMMENT_COLORS)[keyof typeof COMMENT_COLORS];

/**
 * デフォルトのコメント色
 */
export const DEFAULT_COMMENT_COLOR = COMMENT_COLORS.WHITE;
