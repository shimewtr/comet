import type { Stamp } from '@comet/shared';
import { SectionBase } from '../../common/SectionBase';
import './style.scss';

interface ManageDialogProps {
  isOpen: boolean;
  stamps: Stamp[];
  onClose: () => void;
  onDeleteStamp: (stampId: string, event: React.MouseEvent) => void;
  onOpenUploadDialog: () => void;
}

/**
 * カスタムスタンプの一覧・削除・追加をまとめた管理ダイアログ
 * ピッカー本体には削除ボタンを差し込めないため、管理操作はここに集約する
 */
export function ManageDialog({
  isOpen,
  stamps,
  onClose,
  onDeleteStamp,
  onOpenUploadDialog,
}: ManageDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="stamp-dialog-overlay" onClick={onClose}>
      <div
        className="stamp-dialog-container"
        role="dialog"
        aria-label="カスタムスタンプの管理"
        onClick={(event) => event.stopPropagation()}
      >
        <SectionBase
          title={
            <div className="stamp-manage-title">
              <h3>カスタムスタンプの管理</h3>
              <span className="stamp-manage-count">{stamps.length}件</span>
            </div>
          }
          className="stamp-manage-dialog"
        >
          {stamps.length === 0 ? (
            <p className="stamp-manage-empty">
              カスタムスタンプはまだありません
            </p>
          ) : (
            <div className="stamp-grid custom-stamps stamp-manage-grid">
              {stamps.map((stamp) => (
                <div key={stamp.id} className="stamp-button-wrapper">
                  <div className="stamp-button custom-stamp" title={stamp.name}>
                    <img
                      src={stamp.imageUrl}
                      alt={stamp.name}
                      className="custom-stamp-image"
                    />
                    <span className="stamp-label">{stamp.name}</span>
                  </div>
                  <button
                    className="stamp-delete-button"
                    onClick={(event) => onDeleteStamp(stamp.id, event)}
                    title="削除"
                    aria-label={`${stamp.name} を削除`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="stamp-manage-footer">
            <button
              type="button"
              className="stamp-manage-add"
              onClick={onOpenUploadDialog}
            >
              ＋ スタンプを追加
            </button>
            <button
              type="button"
              className="stamp-manage-close"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </SectionBase>
      </div>
    </div>
  );
}
