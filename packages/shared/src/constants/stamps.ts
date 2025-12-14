import { Stamp } from '../types/index.js';

/**
 * デフォルト絵文字スタンプ一覧
 */
export const DEFAULT_STAMPS: Stamp[] = [
  // よく使う絵文字
  { id: 'thumbs-up', name: '👍', imageUrl: '', category: 'reaction' },
  { id: 'thumbs-down', name: '👎', imageUrl: '', category: 'reaction' },
  { id: 'clap', name: '👏', imageUrl: '', category: 'reaction' },
  { id: 'ok-hand', name: '👌', imageUrl: '', category: 'reaction' },
  { id: 'wave', name: '👋', imageUrl: '', category: 'reaction' },
  { id: 'raised-hand', name: '✋', imageUrl: '', category: 'reaction' },

  // 顔文字
  { id: 'smile', name: '😊', imageUrl: '', category: 'emotion' },
  { id: 'laugh', name: '😂', imageUrl: '', category: 'emotion' },
  { id: 'heart-eyes', name: '😍', imageUrl: '', category: 'emotion' },
  { id: 'thinking', name: '🤔', imageUrl: '', category: 'emotion' },
  { id: 'cry', name: '😭', imageUrl: '', category: 'emotion' },
  { id: 'angry', name: '😠', imageUrl: '', category: 'emotion' },
  { id: 'surprise', name: '😮', imageUrl: '', category: 'emotion' },
  { id: 'cool', name: '😎', imageUrl: '', category: 'emotion' },

  // ハート
  { id: 'heart', name: '❤️', imageUrl: '', category: 'emotion' },
  { id: 'blue-heart', name: '💙', imageUrl: '', category: 'emotion' },
  { id: 'green-heart', name: '💚', imageUrl: '', category: 'emotion' },
  { id: 'yellow-heart', name: '💛', imageUrl: '', category: 'emotion' },
  { id: 'purple-heart', name: '💜', imageUrl: '', category: 'emotion' },
  { id: 'orange-heart', name: '🧡', imageUrl: '', category: 'emotion' },

  // その他
  { id: 'fire', name: '🔥', imageUrl: '', category: 'reaction' },
  { id: 'star', name: '⭐', imageUrl: '', category: 'reaction' },
  { id: 'sparkles', name: '✨', imageUrl: '', category: 'reaction' },
  { id: 'party', name: '🎉', imageUrl: '', category: 'reaction' },
  { id: 'rocket', name: '🚀', imageUrl: '', category: 'reaction' },
  { id: '100', name: '💯', imageUrl: '', category: 'reaction' },
  { id: 'eyes', name: '👀', imageUrl: '', category: 'reaction' },
  { id: 'pray', name: '🙏', imageUrl: '', category: 'reaction' },
];

/**
 * スタンプの最大サイズ（ピクセル）
 */
export const STAMP_MAX_SIZE = 100;

/**
 * スタンプの最小サイズ（ピクセル）
 */
export const STAMP_MIN_SIZE = 50;

/**
 * デフォルトのスタンプサイズ（ピクセル）
 */
export const DEFAULT_STAMP_SIZE = 64;

/**
 * スタンプの表示時間（ミリ秒）
 */
export const STAMP_DISPLAY_DURATION = 1200;

/**
 * スタンプのフェードアウト時間（ミリ秒）
 */
export const STAMP_FADE_DURATION = 1200;
