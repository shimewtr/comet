import type { Stamp } from '@comet/shared';

const STORAGE_KEY = 'comet_stamp_palette';

/**
 * パレットの推奨上限。初期パレットと同じ 30 個で、デスクトップ（1 行 13 個）なら 3 行に収まる。
 * これを超えても追加はできるが、超えた分は編集中に赤く示して減らすよう促す
 */
export const MAX_PALETTE_SIZE = 30;

/** 保存データの健全性を守るための絶対上限。ここを超える追加と読み込みは受け付けない */
export const PALETTE_HARD_LIMIT = 100;

/**
 * パレットに保存する最小限の情報。
 * 絵文字は UnifiedPicker と同じ `emoji-<unified>` を id にし、name に表示文字を持つ。
 * カスタムスタンプは id だけを保存し、表示時にサーバから取得した一覧から解決する。
 */
export interface PaletteEntry {
  id: string;
  name: string;
}

/** よく使う反応を中心にした初期パレット（30 個） */
export const DEFAULT_PALETTE: readonly PaletteEntry[] = [
  { id: 'emoji-1f44f', name: '👏' },
  { id: 'emoji-1f389', name: '🎉' },
  { id: 'emoji-1f602', name: '😂' },
  { id: 'emoji-1f44d', name: '👍' },
  { id: 'emoji-1f525', name: '🔥' },
  { id: 'emoji-2764-fe0f', name: '❤️' },
  { id: 'emoji-1f62e', name: '😮' },
  { id: 'emoji-1f4af', name: '💯' },
  { id: 'emoji-1f64c', name: '🙌' },
  { id: 'emoji-1f60d', name: '😍' },
  { id: 'emoji-1f914', name: '🤔' },
  { id: 'emoji-1f605', name: '😅' },
  { id: 'emoji-2728', name: '✨' },
  { id: 'emoji-1f680', name: '🚀' },
  { id: 'emoji-1f64f', name: '🙏' },
  { id: 'emoji-1f606', name: '😆' },
  { id: 'emoji-1f923', name: '🤣' },
  { id: 'emoji-1f60a', name: '😊' },
  { id: 'emoji-1f622', name: '😢' },
  { id: 'emoji-1f4aa', name: '💪' },
  { id: 'emoji-1f38a', name: '🎊' },
  { id: 'emoji-1f440', name: '👀' },
  { id: 'emoji-1fae1', name: '🫡' },
  { id: 'emoji-1f91d', name: '🤝' },
  { id: 'emoji-1f64b', name: '🙋' },
  { id: 'emoji-1f60e', name: '😎' },
  { id: 'emoji-1f973', name: '🥳' },
  { id: 'emoji-1f4a1', name: '💡' },
  { id: 'emoji-1faf6', name: '🫶' },
  { id: 'emoji-1f44b', name: '👋' },
];

const EMOJI_ID_PATTERN = /^emoji-[0-9a-f]+(-[0-9a-f]+)*$/;

export function isEmojiEntry(entry: PaletteEntry): boolean {
  return EMOJI_ID_PATTERN.test(entry.id);
}

export function paletteEntryFromStamp(stamp: Stamp): PaletteEntry {
  return { id: stamp.id, name: stamp.name };
}

/**
 * パレットの項目を送信用の Stamp に解決する。
 * カスタムスタンプが削除されていて一覧に無い場合は null（表示しない）。
 */
export function resolvePaletteEntry(
  entry: PaletteEntry,
  customStamps: readonly Stamp[]
): Stamp | null {
  if (isEmojiEntry(entry)) {
    return {
      id: entry.id,
      name: entry.name,
      imageUrl: '',
      category: 'emotion',
    };
  }
  return customStamps.find((stamp) => stamp.id === entry.id) ?? null;
}

/**
 * fromId の項目を toId の位置へ移す（ドラッグ＆ドロップの並び替え）。
 * 後ろへ動かすと toId の直後、前へ動かすと toId の直前に入り、他の項目は詰めて並ぶ
 */
export function movePaletteEntry(
  entries: readonly PaletteEntry[],
  fromId: string,
  toId: string
): PaletteEntry[] {
  const from = entries.findIndex((entry) => entry.id === fromId);
  const to = entries.findIndex((entry) => entry.id === toId);
  if (from < 0 || to < 0 || from === to) return [...entries];
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function isPaletteEntry(value: unknown): value is PaletteEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    v.name.length > 0
  );
}

function isPalette(value: unknown): value is PaletteEntry[] {
  if (!Array.isArray(value) || value.length > PALETTE_HARD_LIMIT) return false;
  if (!value.every(isPaletteEntry)) return false;
  return new Set(value.map((entry) => entry.id)).size === value.length;
}

export function isDefaultPalette(entries: readonly PaletteEntry[]): boolean {
  return (
    entries.length === DEFAULT_PALETTE.length &&
    entries.every((entry, index) => entry.id === DEFAULT_PALETTE[index].id)
  );
}

/** 保存済みのパレットを返す。未保存・壊れている・Storage が使えない場合は初期パレット */
export function loadStampPalette(): PaletteEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PALETTE];
    const parsed: unknown = JSON.parse(raw);
    return isPalette(parsed) ? parsed : [...DEFAULT_PALETTE];
  } catch {
    return [...DEFAULT_PALETTE];
  }
}

export function saveStampPalette(entries: readonly PaletteEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 保存できなくてもスタンプ送信自体は続けられるようにする
  }
}

/** 保存を消して初期パレットに戻す */
export function clearStampPalette(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 削除できない場合も無視する
  }
}
