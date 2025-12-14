import type { Stamp } from '@comet/shared';

interface CustomStampTabProps {
  stamps: Stamp[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectStamp: (stamp: Stamp) => void;
  onDeleteStamp: (stampId: string, event: React.MouseEvent) => void;
  onOpenUploadDialog: () => void;
  disabled?: boolean;
}

export function CustomStampTab({
  stamps,
  loading,
  searchQuery,
  onSearchChange,
  onSelectStamp,
  onDeleteStamp,
  onOpenUploadDialog,
  disabled = false,
}: CustomStampTabProps) {
  const filteredStamps = stamps.filter((stamp) => {
    if (!searchQuery.trim()) {
      return true;
    }
    const query = searchQuery.toLowerCase();
    return (
      stamp.name.toLowerCase().includes(query) ||
      stamp.id.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <div className="stamp-search">
        <input
          type="text"
          className="stamp-search-input"
          placeholder="カスタムスタンプを検索..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          disabled={disabled}
        />
        {searchQuery && (
          <button
            className="stamp-search-clear"
            onClick={() => onSearchChange('')}
            disabled={disabled}
            aria-label="検索クリア"
          >
            ×
          </button>
        )}
      </div>

      {loading && <div className="stamp-loading">読み込み中...</div>}

      {!loading && stamps.length === 0 && (
        <div className="stamp-no-results">カスタムスタンプがありません</div>
      )}

      {!loading && filteredStamps.length === 0 && searchQuery && (
        <div className="stamp-no-results">
          「{searchQuery}」に一致するカスタムスタンプが見つかりません
        </div>
      )}

      {!loading && filteredStamps.length > 0 && (
        <div className="stamp-grid custom-stamps">
          {filteredStamps.map((stamp) => (
            <div key={stamp.id} className="stamp-button-wrapper">
              <button
                className="stamp-button custom-stamp"
                onClick={() => onSelectStamp(stamp)}
                disabled={disabled}
                title={stamp.name}
              >
                <img
                  src={stamp.imageUrl}
                  alt={stamp.name}
                  className="custom-stamp-image"
                />
                <span className="stamp-label">{stamp.name}</span>
              </button>
              <button
                className="stamp-delete-button"
                onClick={(e) => onDeleteStamp(stamp.id, e)}
                disabled={disabled}
                title="削除"
                aria-label="スタンプを削除"
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="stamp-button add-stamp-button"
            onClick={onOpenUploadDialog}
            disabled={disabled}
            title="スタンプを追加"
          >
            <span className="add-icon">+</span>
          </button>
        </div>
      )}
    </>
  );
}
