import { useState } from 'react';
import type {
  CommentStyle,
  CommentSize,
  CommentAnimation,
  SpeedOption,
} from '@comet/shared';
import {
  COMMENT_COLORS,
  COMMENT_SIZE_OPTIONS,
  SPEED_OPTIONS,
  SPEED_VALUES,
  COMMENT_ANIMATIONS,
} from '@comet/shared';
import { SectionBase } from '../common/SectionBase';
import './style.scss';

interface CommentFormProps {
  onSubmit: (content: string, style: CommentStyle) => void;
  disabled?: boolean;
}

export function CommentForm({ onSubmit, disabled = false }: CommentFormProps) {
  const [content, setContent] = useState('');
  const [color, setColor] = useState<string>(COMMENT_COLORS.WHITE);
  const [size, setSize] = useState<CommentSize>('medium');
  const [speedOption, setSpeedOption] = useState<SpeedOption>('normal');
  const [animation, setAnimation] = useState<CommentAnimation>('none');
  const [isDanmakuMode, setIsDanmakuMode] = useState(false);

  const getRandomColor = (): string => {
    const colors = Object.values(COMMENT_COLORS);
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const getRandomSize = (): CommentSize => {
    return COMMENT_SIZE_OPTIONS[
      Math.floor(Math.random() * COMMENT_SIZE_OPTIONS.length)
    ];
  };

  const getRandomSpeed = (): SpeedOption => {
    return SPEED_OPTIONS[Math.floor(Math.random() * SPEED_OPTIONS.length)];
  };

  const getRandomAnimation = (): CommentAnimation => {
    return COMMENT_ANIMATIONS[
      Math.floor(Math.random() * COMMENT_ANIMATIONS.length)
    ];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      return;
    }

    if (isDanmakuMode) {
      // 弾幕モード: 20個のランダムなスタイルでコメントを送信
      for (let i = 0; i < 20; i++) {
        const randomSpeed = getRandomSpeed();
        const style: CommentStyle = {
          color: getRandomColor(),
          size: getRandomSize(),
          speed: SPEED_VALUES[randomSpeed],
          animation: getRandomAnimation(),
        };
        setTimeout(() => {
          onSubmit(content, style);
        }, i * 100); // 100msずつずらして送信
      }
    } else {
      // 通常モード: 選択したスタイルで1個送信
      const style: CommentStyle = {
        color,
        size,
        speed: SPEED_VALUES[speedOption],
        animation,
      };
      onSubmit(content, style);
    }

    setContent('');
  };

  return (
    <SectionBase title="コメントフォーム" className="comment-form-section">
      <form className="comment-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            id="comment-input"
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="コメントを入力..."
            disabled={disabled}
            className="comment-input"
            maxLength={100}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>色</label>
            <div className="color-picker">
              {Object.entries(COMMENT_COLORS).map(([name, value]) => (
                <button
                  key={value}
                  type="button"
                  className={`color-button ${color === value ? 'selected' : ''}`}
                  style={{ backgroundColor: value }}
                  onClick={() => setColor(value)}
                  disabled={disabled}
                  title={name}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>サイズ</label>
            <div className="size-picker">
              {COMMENT_SIZE_OPTIONS.map((sizeOption) => (
                <button
                  key={sizeOption}
                  type="button"
                  className={`size-button ${size === sizeOption ? 'selected' : ''}`}
                  onClick={() => setSize(sizeOption)}
                  disabled={disabled}
                >
                  {sizeOption.charAt(0).toUpperCase() + sizeOption.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>速度</label>
            <div className="speed-picker">
              {SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={`speed-button ${speedOption === speed ? 'selected' : ''}`}
                  onClick={() => setSpeedOption(speed)}
                  disabled={disabled}
                >
                  {speed.charAt(0).toUpperCase() + speed.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>アニメーション</label>
            <div className="animation-picker">
              {COMMENT_ANIMATIONS.map((anim) => (
                <button
                  key={anim}
                  type="button"
                  className={`animation-button ${animation === anim ? 'selected' : ''}`}
                  onClick={() => setAnimation(anim)}
                  disabled={disabled}
                >
                  {anim.charAt(0).toUpperCase() + anim.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group danmaku-toggle">
            <label>弾幕モード</label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={isDanmakuMode}
                onChange={(e) => setIsDanmakuMode(e.target.checked)}
                disabled={disabled}
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={disabled || !content.trim()}
          className="submit-button"
        >
          コメントを送信
        </button>
      </form>
    </SectionBase>
  );
}
