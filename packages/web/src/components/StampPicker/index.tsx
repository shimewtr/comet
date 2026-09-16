import { useEffect, useState } from 'react';
import { type Stamp } from '@comet/shared';
import { SectionBase } from '../common/SectionBase';
import { StampPalette } from './StampPalette';
import { PaletteEditorDialog } from './PaletteEditorDialog';
import {
  clearStampPalette,
  isDefaultPalette,
  loadStampPalette,
  saveStampPalette,
  type PaletteEntry,
} from '../../stamp-palette';
import './style.scss';

interface StampPickerProps {
  /** サーバに登録済みのカスタムスタンプ。取得と管理は App 側（useCustomStamps）で行う */
  customStamps: Stamp[];
  onSelectStamp: (stamp: Stamp) => void;
  disabled?: boolean;
}

/**
 * よく使うスタンプのパレット。画面にはパレットだけを出し、
 * 中身の変更はモーダルの編集ダイアログで行い、「保存」で反映する（画面のレイアウトを動かさない）
 */
export function StampPicker({
  customStamps,
  onSelectStamp,
  disabled = false,
}: StampPickerProps) {
  const [palette, setPalette] = useState(() => loadStampPalette());
  const [isEditorOpen, setEditorOpen] = useState(false);

  // パレットは変更のたびに保存し、初期状態に戻ったら保存を消す
  useEffect(() => {
    if (isDefaultPalette(palette)) {
      clearStampPalette();
    } else {
      saveStampPalette(palette);
    }
  }, [palette]);

  const handleSave = (entries: PaletteEntry[]) => {
    setPalette(entries);
    setEditorOpen(false);
  };

  return (
    <SectionBase className="stamp-picker">
      <div className="stamp-palette-area">
        <StampPalette
          entries={palette}
          customStamps={customStamps}
          editing={false}
          disabled={disabled}
          onSelect={onSelectStamp}
          onRemove={() => {}}
          onReorder={() => {}}
          editToggleActive={isEditorOpen}
          onToggleEditing={() => setEditorOpen(true)}
        />

        {/* 編集はモーダルのダイアログで行い、「保存」で反映する。スマホ幅では鉛筆ごと出さない */}
        <PaletteEditorDialog
          isOpen={isEditorOpen}
          entries={palette}
          customStamps={customStamps}
          onSave={handleSave}
          onClose={() => setEditorOpen(false)}
        />
      </div>
    </SectionBase>
  );
}
