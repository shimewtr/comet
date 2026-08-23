import { lazy, Suspense } from 'react';
import type { EmojiClickData } from 'emoji-picker-react';
import type { Stamp } from '@comet/shared';

// emoji-picker-reactはバンドルの大半を占めるため、
// タブが表示されるまでロードを遅延して初期表示を軽くする
const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface EmojiTabProps {
  onSelectStamp: (stamp: Stamp) => void;
}

export function EmojiTab({ onSelectStamp }: EmojiTabProps) {
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const stamp: Stamp = {
      id: `emoji-${emojiData.unified}`,
      name: emojiData.emoji,
      imageUrl: '',
      category: 'emotion',
    };
    onSelectStamp(stamp);
  };

  return (
    <div className="emoji-picker-wrapper">
      <Suspense fallback={<div className="emoji-picker-loading">読み込み中...</div>}>
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          width="100%"
          height="400px"
          searchPlaceHolder="絵文字を検索..."
          previewConfig={{
            showPreview: false,
          }}
          autoFocusSearch={false}
          skinTonesDisabled
        />
      </Suspense>
    </div>
  );
}
