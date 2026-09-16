import { useState } from 'react';
import type { Stamp } from '@comet/shared';
import { ManageDialog } from '../StampPicker/ManageDialog';
import { UploadDialog } from '../StampPicker/UploadDialog';

interface CustomStampManagerProps {
  isOpen: boolean;
  onClose: () => void;
  customStamps: Stamp[];
  uploading: boolean;
  onDeleteStamp: (stampId: string) => Promise<void>;
  onUploadStamp: (file: File, name: string) => Promise<void>;
}

/**
 * カスタムスタンプの一覧・削除・追加をまとめたダイアログ群。
 * ヘッダーの「…」メニューから開く。API 呼び出しは useCustomStamps に任せ、ここは確認と結果表示だけを持つ
 */
export function CustomStampManager({
  isOpen,
  onClose,
  customStamps,
  uploading,
  onDeleteStamp,
  onUploadStamp,
}: CustomStampManagerProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const handleDelete = async (stampId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm('このスタンプを削除しますか？')) return;

    try {
      await onDeleteStamp(stampId);
    } catch (error) {
      console.error('Failed to delete stamp:', error);
      const message = error instanceof Error ? error.message : '不明なエラー';
      alert(`削除に失敗しました: ${message}`);
    }
  };

  const handleUpload = async (file: File, name: string) => {
    try {
      await onUploadStamp(file, name);
      // 追加後は一覧に戻って、登録されたことを確かめられるようにする
      setShowUploadDialog(false);
      alert('スタンプをアップロードしました！');
    } catch (error) {
      console.error('Upload error:', error);
      alert(
        error instanceof Error ? error.message : 'アップロードに失敗しました'
      );
    }
  };

  return (
    <>
      <ManageDialog
        isOpen={isOpen && !showUploadDialog}
        stamps={customStamps}
        onClose={onClose}
        onDeleteStamp={handleDelete}
        onOpenUploadDialog={() => setShowUploadDialog(true)}
      />
      <UploadDialog
        isOpen={isOpen && showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onUpload={handleUpload}
        uploading={uploading}
      />
    </>
  );
}
