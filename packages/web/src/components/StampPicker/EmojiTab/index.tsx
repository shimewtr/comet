import EmojiPicker from 'emoji-picker-react';
import type { Stamp } from '@comet/shared';

interface EmojiTabProps {
  onSelectStamp: (stamp: Stamp) => void;
}

export function EmojiTab({ onSelectStamp }: EmojiTabProps) {
  const handleEmojiClick = (emojiData: any) => {
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
    </div>
  );
}
