import { PostCommentRequest, CommentStyle } from '../types/index.js';
import { COMMENT_COLORS } from '../constants/index.js';

/**
 * コメント内容の最大文字数
 */
const MAX_COMMENT_LENGTH = 100;

/**
 * コメント内容の検証
 */
export function isValidCommentContent(content: string): boolean {
  return (
    typeof content === 'string' &&
    content.trim().length > 0 &&
    content.length <= MAX_COMMENT_LENGTH
  );
}

/**
 * コメント色の検証
 */
export function isValidCommentColor(color: string): boolean {
  const validColors = Object.values(COMMENT_COLORS);
  return validColors.includes(color as any);
}

/**
 * コメント投稿リクエストの検証
 */
export function validatePostCommentRequest(
  request: PostCommentRequest
): { valid: boolean; error?: string } {
  if (!isValidCommentContent(request.content)) {
    return {
      valid: false,
      error: `Comment content must be 1-${MAX_COMMENT_LENGTH} characters`,
    };
  }

  return { valid: true };
}

/**
 * デフォルトのコメントスタイルを適用
 */
export function applyDefaultCommentStyle(
  style?: Partial<CommentStyle>
): CommentStyle {
  return {
    color: style?.color || COMMENT_COLORS.WHITE,
    size: style?.size || 'medium',
    speed: style?.speed || 5,
    animation: style?.animation || 'none',
  };
}
