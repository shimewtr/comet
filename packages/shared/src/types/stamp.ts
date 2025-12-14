/**
 * スタンプの基本型定義
 */
export interface Stamp {
  id: string;
  name: string;
  imageUrl: string;
  category: StampCategory;
}

/**
 * スタンプカテゴリー
 */
export type StampCategory = 'emotion' | 'reaction' | 'custom';

/**
 * スタンプ投稿リクエスト
 */
export interface PostStampRequest {
  stampId: string;
  position?: {
    x: number;
    y: number;
  };
}

/**
 * スタンプメッセージ
 */
export interface StampMessage {
  id: string;
  stamp: Stamp;
  timestamp: number;
  userId?: string;
  position?: {
    x: number;
    y: number;
  };
}
