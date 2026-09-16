import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Stamp } from '@comet/shared';
import {
  DEFAULT_PALETTE,
  MAX_PALETTE_SIZE,
  PALETTE_HARD_LIMIT,
  isDefaultPalette,
  movePaletteEntry,
  paletteEntryFromStamp,
  type PaletteEntry,
} from '../../../stamp-palette';
import { StampPalette } from '../StampPalette';
// ManageDialog と同じオーバーレイ（.stamp-dialog-overlay / .stamp-dialog-container）を使う
import '../ManageDialog/style.scss';

// emoji-picker-react を含むモジュールは重いので、ダイアログを初めて開くときに遅延ロードする
const UnifiedPicker = lazy(() => import('../UnifiedPicker'));

interface PaletteEditorDialogProps {
  isOpen: boolean;
  /** 開いた時点のパレット。ダイアログ内ではこのコピー（下書き）を編集する */
  entries: readonly PaletteEntry[];
  customStamps: Stamp[];
  onSave: (entries: PaletteEntry[]) => void;
  onClose: () => void;
}

/**
 * パレットの編集ダイアログ（モーダル）。
 * 画面上のパレットを直接いじるとレイアウトが動いてしまうので、別レイヤーで下書きを編集し、
 * 「保存」で初めて反映する。×・Escape・背景のクリックで閉じると下書きは捨てる。
 * 内容が高くなりがちなので、画面中央に置いて高さは画面内に収める
 */
export function PaletteEditorDialog(props: PaletteEditorDialogProps) {
  // 開くたびに下書きを作り直すため、中身は isOpen のときだけマウントする
  if (!props.isOpen) return null;
  return <PaletteEditor {...props} />;
}

function PaletteEditor({
  entries,
  customStamps,
  onSave,
  onClose,
}: PaletteEditorDialogProps) {
  const [draft, setDraft] = useState<PaletteEntry[]>(() => [...entries]);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<number | undefined>(undefined);

  // emoji-picker-react は onEmojiClick を初回に渡した関数のまま保持し続けるため、
  // ピッカーから呼ばれる追加処理は最新の下書きを ref 経由で読む
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => () => window.clearTimeout(noticeTimeoutRef.current), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 2500);
  };

  // ピッカーで押したスタンプをパレットに入れる。すでに入っているものを押したら外す（チェックボックスと同じ）
  const toggleInDraft = (stamp: Stamp) => {
    const current = draftRef.current;
    if (current.some((entry) => entry.id === stamp.id)) {
      const next = current.filter((entry) => entry.id !== stamp.id);
      draftRef.current = next;
      setDraft(next);
      return;
    }
    // 推奨上限（MAX_PALETTE_SIZE）は超えてもよい。超えた分はパレット側で赤く示し、保存を止める
    if (current.length >= PALETTE_HARD_LIMIT) {
      showNotice(`これ以上は追加できません（最大 ${PALETTE_HARD_LIMIT} 個）`);
      return;
    }
    // 連打されても ref を先に進めて、同じスタンプが二重に入らないようにする
    const next = [...current, paletteEntryFromStamp(stamp)];
    draftRef.current = next;
    setDraft(next);
  };

  const overLimitCount = Math.max(0, draft.length - MAX_PALETTE_SIZE);

  // 下書きに入っている絵文字を、ピッカー側で「選択済み」として示すための CSS。
  // ピッカーの絵文字ボタンは data-unified（絵文字は unified コード、カスタムはスタンプ id）を持つので、
  // それを列挙して --in-palette を 1 にする。見た目の定義は style.scss 側にある
  const selectedCss = useMemo(() => {
    if (draft.length === 0) return '';
    const escape = (value: string) =>
      typeof CSS !== 'undefined' && 'escape' in CSS
        ? CSS.escape(value)
        : value.replace(/["\\]/g, '\\$&');
    const selectors = draft
      .map((entry) => {
        const unified = entry.id.startsWith('emoji-')
          ? entry.id.slice('emoji-'.length)
          : entry.id;
        return `[data-unified="${escape(unified)}"]`;
      })
      .join(',');
    return `.palette-editor .epr-emoji:is(${selectors}){--in-palette:1;}`;
  }, [draft]);

  return (
    <div className="stamp-dialog-overlay" onClick={onClose}>
      <div
        className="stamp-dialog-container is-wide"
        role="dialog"
        aria-modal="true"
        aria-label="パレットを編集"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-editor">
          <style>{selectedCss}</style>

          {/* 選択中のスタンプ（下書き）。ドラッグで並び替え、× で外す */}
          <div className="stamp-edit-panel-palette">
            <StampPalette
              entries={draft}
              customStamps={customStamps}
              editing
              limit={MAX_PALETTE_SIZE}
              showEditToggle={false}
              onSelect={() => {}}
              onRemove={(id) =>
                setDraft((prev) => prev.filter((entry) => entry.id !== id))
              }
              onReorder={(fromId, toId) =>
                setDraft((prev) => movePaletteEntry(prev, fromId, toId))
              }
              onToggleEditing={() => {}}
            />

            {/* 「はじめの状態に戻す」（左）と件数（右）。件数は上限を超えたら赤くなるだけで、文章では説明しない */}
            <div className="palette-editor-meta">
              <button
                type="button"
                className="palette-editor-button"
                onClick={() => setDraft([...DEFAULT_PALETTE])}
                disabled={isDefaultPalette(draft)}
              >
                はじめの状態に戻す
              </button>
              <p
                className={`stamp-palette-count${overLimitCount > 0 ? ' is-over' : ''}`}
                role="status"
                aria-label={
                  notice ??
                  `${draft.length} 個（上限 ${MAX_PALETTE_SIZE} 個${overLimitCount > 0 ? '、超過' : ''}）`
                }
              >
                {notice ?? `${draft.length}/${MAX_PALETTE_SIZE}`}
              </p>
            </div>
          </div>

          {/* 全体ピッカーはパレットの「追加元」なので、パレットの下に入れ子の枠として置く */}
          <section
            className="stamp-edit-panel-source"
            aria-label="追加するスタンプを選ぶ"
          >
            <div className="emoji-picker-wrapper stamp-edit-panel-picker">
              <Suspense
                fallback={
                  <div className="emoji-picker-loading">読み込み中...</div>
                }
              >
                <UnifiedPicker
                  customStamps={customStamps}
                  onSelectStamp={toggleInDraft}
                  initialSearchTab
                />
              </Suspense>
            </div>
          </section>

          {/* 確定操作はダイアログの下部に置く */}
          <div className="palette-editor-footer">
            <button
              type="button"
              className="palette-editor-button"
              onClick={onClose}
              title="変更は保存されません"
            >
              閉じる
            </button>
            <button
              type="button"
              className="palette-editor-button is-primary"
              onClick={() => onSave(draft)}
              disabled={overLimitCount > 0}
              title={
                overLimitCount > 0
                  ? `${MAX_PALETTE_SIZE} 個以内に収めると保存できます`
                  : undefined
              }
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
