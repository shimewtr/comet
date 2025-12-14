import type { CommentAnimation } from '../types/comment.js';

/**
 * アニメーションの選択肢
 */
export const COMMENT_ANIMATIONS: readonly CommentAnimation[] = [
  'none',
  'blink',
  'bounce',
  'shake',
] as const;
