import { useEffect, useRef, useState } from 'react';
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

// 連投による荒れ・過負荷を防ぐための送信クールダウン
const COMMENT_COOLDOWN_MS = 2000;
const DANMAKU_COOLDOWN_MS = 10000;

export function CommentForm({ onSubmit, disabled = false }: CommentFormProps) {
  const [content, setContent] = useState('');
  const [color, setColor] = useState<string>(COMMENT_COLORS.WHITE);
  const [size, setSize] = useState<CommentSize>('medium');
  const [speedOption, setSpeedOption] = useState<SpeedOption>('normal');
  const [animation, setAnimation] = useState<CommentAnimation>('none');
  const [isDanmakuMode, setIsDanmakuMode] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0); // 残り秒数
  const danmakuTimeoutsRef = useRef<number[]>([]);
  const cooldownTimerRef = useRef<number | null>(null);

  // アンマウント時に未発火のタイマーを破棄する
  useEffect(() => {
    return () => {
      danmakuTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      danmakuTimeoutsRef.current = [];
      if (cooldownTimerRef.current !== null) {
        window.clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  const startCooldown = (durationMs: number) => {
    const endAt = Date.now() + durationMs;
    setCooldownRemaining(Math.ceil(durationMs / 1000));

    if (cooldownTimerRef.current !== null) {
      window.clearInterval(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = window.setInterval(() => {
      const remaining = endAt - Date.now();
      if (remaining <= 0) {
        if (cooldownTimerRef.current !== null) {
          window.clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }
        setCooldownRemaining(0);
      } else {
        setCooldownRemaining(Math.ceil(remaining / 1000));
      }
    }, 250);
  };

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

    if (disabled || !content.trim() || cooldownRemaining > 0) {
      return;
    }

    if (isDanmakuMode) {
      // 盛り上げモード: 20個のランダムなスタイルでコメントを送信
      for (let i = 0; i < 20; i++) {
        const randomSpeed = getRandomSpeed();
        const style: CommentStyle = {
          color: getRandomColor(),
          size: getRandomSize(),
          speed: SPEED_VALUES[randomSpeed],
          animation: getRandomAnimation(),
        };
        const timeoutId = window.setTimeout(() => {
          onSubmit(content, style);
        }, i * 100); // 100msずつずらして送信
        danmakuTimeoutsRef.current.push(timeoutId);
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

    startCooldown(isDanmakuMode ? DANMAKU_COOLDOWN_MS : COMMENT_COOLDOWN_MS);
    setContent('');

    // 盛り上げモードは1回送信したら自動でOFFに戻す（連続送信は意図的な操作にする）
    if (isDanmakuMode) {
      setIsDanmakuMode(false);
    }
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
            <label>盛り上げモード</label>
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
          disabled={disabled || !content.trim() || cooldownRemaining > 0}
          className="submit-button"
        >
          {cooldownRemaining > 0
            ? `コメントを送信 (${cooldownRemaining}秒)`
            : 'コメントを送信'}
        </button>
      </form>
    </SectionBase>
  );
}
