import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Stamp } from '@comet/shared';
import { PencilIcon } from '../../../assets/icons/PencilIcon';
import { resolvePaletteEntry, type PaletteEntry } from '../../../stamp-palette';

interface StampPaletteProps {
  entries: readonly PaletteEntry[];
  customStamps: readonly Stamp[];
  /** 編集中はタイルをドラッグで並び替え、右上の × でパレットから外す（送信はしない） */
  editing: boolean;
  /** 表示中のパレットからスタンプを送れない状態。編集操作には影響させない */
  disabled?: boolean;
  /** 推奨上限。編集中はこの位置より後ろのスタンプを「超過」として赤く示す */
  limit?: number;
  /** 末尾の鉛筆タイルを出すか。編集パネルの中では出さない */
  showEditToggle?: boolean;
  /** 編集パネルが開いているか（鉛筆タイルの押下状態） */
  editToggleActive?: boolean;
  onSelect: (stamp: Stamp) => void;
  onRemove: (id: string) => void;
  /** fromId のスタンプを toId の位置へ移す（ドラッグ中に随時呼ばれる） */
  onReorder: (fromId: string, toId: string) => void;
  /** 末尾の鉛筆タイル。編集パネルを開閉する */
  onToggleEditing: () => void;
}

/** この距離（px）以上動かしたらドラッグ扱いにし、離してもクリック（外す）にはしない */
const DRAG_THRESHOLD = 6;
/** 周りのスタンプが滑って空きを作るアニメーションの長さ */
const MOVE_DURATION_MS = 180;

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** 掴んだ位置とタイル左上のずれ。タイルがポインタの下で「掴んだ場所のまま」動くようにする */
  grabX: number;
  grabY: number;
  /** しきい値を超えて実際にドラッグ中か */
  active: boolean;
}

/**
 * 送信に使うスタンプを並べたパレット。画面上の表示と、編集パネル内の下書きの両方で使う。
 *
 * 並び替えは Pointer Events で実装し、マウスとタッチの両方で同じ挙動にする。
 * ドラッグ中に別のタイルへ重なった時点で順番を入れ替え（ライブ並び替え）、
 * 位置が変わったタイルは FLIP（前の位置から新しい位置へ transform で滑らせる）でぬるっと動かす
 */
export function StampPalette({
  entries,
  customStamps,
  editing,
  disabled = false,
  limit,
  showEditToggle = true,
  editToggleActive = false,
  onSelect,
  onRemove,
  onReorder,
  onToggleEditing,
}: StampPaletteProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // document に付けたリスナーから最新の状態を読むための ref
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  // ドラッグ直後に発火する click（× ボタン等）が走らないよう、一度だけ握りつぶす
  const suppressClickRef = useRef(false);
  // ポインタ移動のたびに再レンダーしないよう、位置は ref で持ち、掴んだタイルは直接 transform する
  const pointerRef = useRef({ x: 0, y: 0 });
  const tileRefs = useRef(new Map<string, HTMLElement>());
  /** 並び替え直前に撮った各タイルの見た目の位置（FLIP の "First"） */
  const snapshotRef = useRef<Map<string, DOMRect> | null>(null);
  /** 掴んでいるタイルの、transform を除いた本来の位置 */
  const draggedBaseRef = useRef<DOMRect | null>(null);
  /**
   * 各タイルの transform を除いたレイアウト上の位置。ドロップ先の判定に使う。
   * 見た目の位置（elementFromPoint）で判定すると、滑っている途中のタイルに当たって
   * 順番が行ったり来たりするため、レイアウト上の位置で判定して揺れを防ぐ
   */
  const layoutRectsRef = useRef(new Map<string, DOMRect>());

  const stamps = entries
    .map((entry) => resolvePaletteEntry(entry, customStamps))
    .filter((stamp): stamp is Stamp => stamp !== null);

  const setTileRef = (id: string) => (el: HTMLElement | null) => {
    if (el) tileRefs.current.set(id, el);
    else tileRefs.current.delete(id);
  };

  /** 掴んでいるタイルをポインタの下に置く（本来の位置からのずれを transform で表す） */
  const positionDragged = (state: DragState) => {
    const el = tileRefs.current.get(state.id);
    const base = draggedBaseRef.current;
    if (!el || !base) return;
    const x = pointerRef.current.x - state.grabX - base.left;
    const y = pointerRef.current.y - state.grabY - base.top;
    el.style.transition = 'none';
    el.style.transform = `translate(${x}px, ${y}px) scale(1.05)`;
  };

  /** 並び替えの直前に、全タイルの今の見た目の位置を記録する */
  const snapshotTiles = () => {
    const snapshot = new Map<string, DOMRect>();
    tileRefs.current.forEach((el, id) => {
      snapshot.set(id, el.getBoundingClientRect());
    });
    snapshotRef.current = snapshot;
  };

  // 並び替え後のレイアウトが確定した直後（描画前）に FLIP を仕込む。
  // 対象は「並び替え直後」と「ドラッグ中」だけ。それ以外の再レンダーで触ると、
  // 離した直後の収まりアニメーションまで止めてしまう
  useLayoutEffect(() => {
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    if (!snapshot && !drag?.active) return;
    const layoutRects = new Map<string, DOMRect>();

    tileRefs.current.forEach((el, id) => {
      const isDragged = drag?.active === true && drag.id === id;
      // 一度 transform を外して本来の位置を測る（進行中のアニメーションはここで止まる）
      el.style.transition = 'none';
      el.style.transform = 'none';
      const rect = el.getBoundingClientRect();
      layoutRects.set(id, rect);

      if (isDragged) {
        draggedBaseRef.current = rect;
        return;
      }
      const before = snapshot?.get(id);
      if (!before) return;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (dx === 0 && dy === 0) return;
      // 前の位置に置いてから、次のフレームで transform を外して新しい位置へ滑らせる
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${MOVE_DURATION_MS}ms ease`;
        el.style.transform = '';
      });
    });

    layoutRectsRef.current = layoutRects;
    if (drag?.active) positionDragged(drag);
  });

  const handlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    id: string
  ) => {
    if (!editing || event.button !== 0) return;
    // × ボタンを押したときはドラッグを始めない（クリックで外す操作を優先する）
    if ((event.target as Element).closest('.stamp-palette-remove')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setDrag({
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      active: false,
    });
  };

  // ドラッグ中の move / up は document で受ける。
  // 並び替えで React がタイルを DOM 上で動かすと、そのタイルに張ったポインタキャプチャは解放されてしまい、
  // pointer-events: none の掴んだタイルには pointerup が届かなくなるため
  const hasDrag = drag !== null;

  useEffect(() => {
    if (!hasDrag) return;

    const handleMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      pointerRef.current = { x: event.clientX, y: event.clientY };

      if (!current.active) {
        const moved = Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY
        );
        if (moved < DRAG_THRESHOLD) return;
        // ここからドラッグ扱い。掴んだタイルを浮かせる（再レンダー後の layout effect で位置決めする）
        setDrag({ ...current, active: true });
        return;
      }

      positionDragged(current);

      // ポインタがレイアウト上どのタイルの上にあるかを見て、別のタイルならその場で順番を入れ替える。
      // 入れ替え後はポインタが自分の空きの上になるので、それ以上は動かず落ち着く
      let overId: string | null = null;
      layoutRectsRef.current.forEach((rect, id) => {
        if (id === current.id) return;
        if (
          event.clientX >= rect.left &&
          event.clientX < rect.right &&
          event.clientY >= rect.top &&
          event.clientY < rect.bottom
        ) {
          overId = id;
        }
      });
      if (overId) {
        snapshotTiles();
        onReorderRef.current(current.id, overId);
      }
    };

    const handleEnd = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (current.active) {
        suppressClickRef.current = true;
        // click はこの pointerup の直後に同期的に届くので、次のタスクでフラグを戻す
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        // 掴んでいたタイルを本来の位置へ滑らせて収める
        const el = tileRefs.current.get(current.id);
        if (el) {
          el.style.transition = `transform ${MOVE_DURATION_MS}ms ease`;
          el.style.transform = '';
        }
      }
      draggedBaseRef.current = null;
      setDrag(null);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
    document.addEventListener('pointercancel', handleEnd);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
      document.removeEventListener('pointercancel', handleEnd);
    };
    // drag の有無が切り替わったときだけ購読し直す（中身は ref で読む）
  }, [hasDrag]);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const classNames = ['stamp-palette'];
  if (editing) classNames.push('is-editing');
  if (drag?.active) classNames.push('is-dragging');

  return (
    <div
      className={classNames.join(' ')}
      role={editing ? 'list' : undefined}
      onClickCapture={handleClickCapture}
    >
      {stamps.map((stamp, index) => {
        const isDragged = drag?.active === true && drag.id === stamp.id;
        const isOverLimit = editing && limit !== undefined && index >= limit;
        const className = [
          'stamp-palette-button',
          isDragged ? 'is-dragged' : '',
          isOverLimit ? 'is-over-limit' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const content = stamp.imageUrl ? (
          <img src={stamp.imageUrl} alt="" draggable={false} />
        ) : (
          <span aria-hidden="true">{stamp.name}</span>
        );

        if (editing) {
          // 編集中のタイルはドラッグ専用。外す操作は右上の × ボタンだけで受ける
          // （タイル全体を押して外れると反応領域が広すぎる）
          return (
            <div
              key={stamp.id}
              ref={setTileRef(stamp.id)}
              role="listitem"
              data-stamp-id={stamp.id}
              className={className}
              aria-label={`${stamp.name}（ドラッグで並び替え${isOverLimit ? '、上限超え' : ''}）`}
              title={stamp.name}
              onPointerDown={(event) => handlePointerDown(event, stamp.id)}
            >
              {content}
              <button
                type="button"
                className="stamp-palette-remove"
                onClick={() => onRemove(stamp.id)}
                aria-label={`${stamp.name} をパレットから外す`}
                title="パレットから外す"
              >
                {/* 文字の × は書体によって中心がずれるので、線で描いて丸の中央に置く */}
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M1.5 1.5l5 5M6.5 1.5l-5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          );
        }

        return (
          <button
            key={stamp.id}
            ref={setTileRef(stamp.id)}
            type="button"
            data-stamp-id={stamp.id}
            className={className}
            disabled={disabled}
            onClick={() => onSelect(stamp)}
            title={stamp.name}
            aria-label={`${stamp.name} を送る`}
          >
            {content}
          </button>
        );
      })}

      {/* 見出しを持たないので、パレットの編集はスタンプ列の末尾のタイルから入る */}
      {showEditToggle && (
        <button
          type="button"
          className="stamp-palette-button stamp-palette-edit"
          onClick={onToggleEditing}
          aria-pressed={editToggleActive}
          aria-expanded={editToggleActive}
          aria-label="パレットを編集"
          title="パレットを編集"
        >
          <PencilIcon />
        </button>
      )}
    </div>
  );
}
