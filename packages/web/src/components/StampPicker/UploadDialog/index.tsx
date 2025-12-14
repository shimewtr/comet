import { useState } from 'react';
import { SectionBase } from '../../common/SectionBase';
import './style.scss';

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, name: string) => Promise<void>;
  uploading: boolean;
}

export function UploadDialog({ isOpen, onClose, onUpload, uploading }: UploadDialogProps) {
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!uploadFile || !uploadName.trim()) {
      alert('ファイルと名前を入力してください');
      return;
    }

    await onUpload(uploadFile, uploadName.trim());

    // 成功したらリセット
    setUploadName('');
    setUploadFile(null);
  };

  const handleClose = () => {
    setUploadName('');
    setUploadFile(null);
    onClose();
  };

  return (
    <div className="upload-dialog-overlay" onClick={handleClose}>
      <div className="upload-dialog-container" onClick={(e) => e.stopPropagation()}>
        <SectionBase title="カスタムスタンプを追加" className="upload-dialog">
          <div className="upload-dialog-body">
            <div className="upload-form-group">
              <label>スタンプ名</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="スタンプ名を入力"
                disabled={uploading}
              />
            </div>
            <div className="upload-form-group">
              <label>画像ファイル</label>
              <label className="file-input-label">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                  className="file-input-hidden"
                />
                <span className="file-input-button">
                  {uploadFile ? uploadFile.name : 'ファイルを選択'}
                </span>
              </label>
            </div>
            {uploadFile && (
              <div className="upload-preview">
                <img
                  src={URL.createObjectURL(uploadFile)}
                  alt="プレビュー"
                />
              </div>
            )}
          </div>
          <div className="upload-dialog-footer">
            <button
              className="upload-cancel-button"
              onClick={handleClose}
              disabled={uploading}
            >
              キャンセル
            </button>
            <button
              className="upload-submit-button"
              onClick={handleSubmit}
              disabled={uploading || !uploadFile || !uploadName.trim()}
            >
              {uploading ? 'アップロード中...' : 'アップロード'}
            </button>
          </div>
        </SectionBase>
      </div>
    </div>
  );
}
