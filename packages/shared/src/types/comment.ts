/**
 * コメントの基本型定義
 */
export interface Comment {
  id: string;
  content: string;
  timestamp: number;
  userId?: string;
  style: CommentStyle;
}

/**
 * コメントのスタイル設定
 */
export interface CommentStyle {
  color: string;
  size: CommentSize;
  animation?: CommentAnimation;
  speed?: number; // アニメーション速度（秒）
}

/**
 * コメントサイズ
 */
export type CommentSize = 'small' | 'medium' | 'large';

/**
 * コメントアニメーション
 */
export type CommentAnimation = 'none' | 'blink' | 'bounce' | 'shake';

/**
 * コメント投稿リクエスト
 */
export interface PostCommentRequest {
  content: string;
  style?: Partial<CommentStyle>;
}

/**
 * コメント投稿レスポンス
 */
export interface PostCommentResponse {
  success: boolean;
  comment?: Comment;
  error?: string;
}
