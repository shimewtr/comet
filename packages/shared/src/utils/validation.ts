import {
  PostCommentRequest,
  CommentStyle,
  CommentAnimation,
} from '../types/index.js';
import { COMMENT_COLORS, COMMENT_SIZE_OPTIONS } from '../constants/index.js';

/**
 * コメント内容の最大文字数
 */
const MAX_COMMENT_LENGTH = 100;
export const MAX_ROOM_NAME_LENGTH = 50;

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

/** room表示名を正規化・検証する */
export function normalizeRoomName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const normalized = name.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_ROOM_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
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
export function validatePostCommentRequest(request: PostCommentRequest): {
  valid: boolean;
  error?: string;
} {
  if (!isValidCommentContent(request.content)) {
    return {
      valid: false,
      error: `Comment content must be 1-${MAX_COMMENT_LENGTH} characters`,
    };
  }

  return { valid: true };
}

/**
 * スタンプ画像URLとして許可するホスト名のサフィックス
 * （スタンプ画像はCloudFront経由で配信される）
 */
const ALLOWED_STAMP_IMAGE_HOST_SUFFIXES = ['.cloudfront.net'];

/**
 * スタンプ画像URLの検証
 * WebSocket経由で受信したURLをそのままimg.srcに設定すると
 * 任意の外部URLを読み込ませられるため、配信元を許可リストで制限する
 */
export function isAllowedStampImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_STAMP_IMAGE_HOST_SUFFIXES.some((suffix) =>
        parsed.hostname.endsWith(suffix)
      )
    );
  } catch {
    return false;
  }
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

const VALID_ANIMATIONS: readonly CommentAnimation[] = [
  'none',
  'blink',
  'bounce',
  'shake',
];

const MIN_COMMENT_SPEED = 1;
const MAX_COMMENT_SPEED = 10;

/**
 * 外部入力のコメントスタイルを検証し、不正な値はデフォルトに置き換える
 */
export function sanitizeCommentStyle(
  style?: Partial<CommentStyle>
): CommentStyle {
  const applied = applyDefaultCommentStyle(style);

  return {
    color: isValidCommentColor(applied.color)
      ? applied.color
      : COMMENT_COLORS.WHITE,
    size: COMMENT_SIZE_OPTIONS.includes(applied.size) ? applied.size : 'medium',
    speed:
      typeof applied.speed === 'number' &&
      Number.isFinite(applied.speed) &&
      applied.speed >= MIN_COMMENT_SPEED &&
      applied.speed <= MAX_COMMENT_SPEED
        ? applied.speed
        : 5,
    animation: VALID_ANIMATIONS.includes(applied.animation ?? 'none')
      ? applied.animation
      : 'none',
  };
}
