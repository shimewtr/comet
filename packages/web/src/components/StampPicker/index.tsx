import { useState, useEffect } from 'react';
import { type Stamp } from '@comet/shared';
import { authHeaders } from '../../auth';
import { TabbedSectionBase, type Tab } from '../common/TabbedSectionBase';
import { UploadDialog } from './UploadDialog';
import { EmojiTab } from './EmojiTab';
import { CustomStampTab } from './CustomStampTab';
import './style.scss';

interface StampPickerProps {
  onSelectStamp: (stamp: Stamp) => void;
  disabled?: boolean;
}

const STAMPS_API_URL = `${import.meta.env.VITE_STAMP_API_URL}/stamps`;

export function StampPicker({
  onSelectStamp,
  disabled = false,
}: StampPickerProps) {
  const [customStamps, setCustomStamps] = useState<Stamp[]>([]);
  const [loading, setLoading] = useState(false);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchCustomStamps = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(STAMPS_API_URL, {
        signal,
        headers: await authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setCustomStamps(data.stamps || []);
      } else {
        console.error('Failed to fetch custom stamps:', response.status);
      }
    } catch (error) {
      // アンマウントによる中断はエラー扱いしない
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch custom stamps:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomStamps(controller.signal);
    return () => controller.abort();
  }, []);

  const handleDeleteStamp = async (
    stampId: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();

    if (!confirm('このスタンプを削除しますか？')) {
      return;
    }

    try {
      const response = await fetch(`${STAMPS_API_URL}/${stampId}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });

      if (response.ok) {
        setCustomStamps((prev) => prev.filter((s) => s.id !== stampId));
      } else {
        const data = await response.json();
        const errorMessage = data.error || '不明なエラー';
        alert(`削除に失敗しました: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Failed to delete stamp:', error);
      alert('削除に失敗しました');
    }
  };

  const handleUpload = async (file: File, name: string) => {
    setUploading(true);

    try {
      const UPLOAD_API_URL = `${import.meta.env.VITE_STAMP_API_URL}/upload`;

      const response = await fetch(UPLOAD_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          stampName: name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.error || 'アップロードURLの取得に失敗しました';
        throw new Error(errorMessage);
      }

      const { uploadUrl, stampId } = await response.json();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('画像のアップロードに失敗しました');
      }

      // アップロード完了をサーバに通知してスタンプを有効化する
      const confirmResponse = await fetch(
        `${STAMPS_API_URL}/${stampId}/confirm`,
        { method: 'POST', headers: await authHeaders() }
      );

      if (!confirmResponse.ok) {
        throw new Error('スタンプの有効化に失敗しました');
      }

      setShowUploadDialog(false);
      await fetchCustomStamps();
      alert('スタンプをアップロードしました！');
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'アップロードに失敗しました';
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const tabs: Tab[] = [
    {
      id: 'emoji',
      label: '絵文字',
      content: <EmojiTab onSelectStamp={onSelectStamp} />,
    },
    {
      id: 'custom',
      label: 'カスタム',
      content: (
        <CustomStampTab
          stamps={customStamps}
          loading={loading}
          searchQuery={customSearchQuery}
          onSearchChange={setCustomSearchQuery}
          onSelectStamp={onSelectStamp}
          onDeleteStamp={handleDeleteStamp}
          onOpenUploadDialog={() => setShowUploadDialog(true)}
          disabled={disabled}
        />
      ),
    },
  ];

  return (
    <>
      <TabbedSectionBase
        title="スタンプ"
        tabs={tabs}
        defaultTab="emoji"
        disabled={disabled}
        className="stamp-picker"
      />

      <UploadDialog
        isOpen={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onUpload={handleUpload}
        uploading={uploading}
      />
    </>
  );
}
