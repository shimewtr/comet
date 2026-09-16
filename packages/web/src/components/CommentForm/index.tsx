import { useEffect, useRef, useState } from 'react';
import type {
  CommentStyle,
  CommentSize,
  CommentAnimation,
  SpeedOption,
} from '@comet/shared';
import {
  COMMENT_COLORS,
  COMMENT_SIZES,
  COMMENT_SIZE_OPTIONS,
  SPEED_OPTIONS,
  SPEED_VALUES,
  COMMENT_ANIMATIONS,
} from '@comet/shared';
import { SectionBase } from '../common/SectionBase';
import {
  BoltIcon,
  ClearFormatIcon,
  SparklesIcon,
  SpeedIcon,
  TextSizeIcon,
} from '../../assets/icons';
import { SettingMenu } from './SettingMenu';
import {
  clearCommentStyleSettings,
  loadCommentStyleSettings,
  saveCommentStyleSettings,
} from '../../comment-style-settings';
import {
  ANIMATION_LABELS,
  COLOR_LABELS,
  SIZE_LABELS,
  SPEED_LABELS,
} from '../../labels';
import './style.scss';

interface CommentFormProps {
  onSubmit: (content: string, style: CommentStyle) => void;
  disabled?: boolean;
}

// 連投による荒れ・過負荷を防ぐための送信クールダウン
const COMMENT_COOLDOWN_MS = 2000;
const DANMAKU_COOLDOWN_MS = 10000;
const PREVIEW_SIZE_SCALE = 0.65;

// 職人設定の初期値。リセットボタンでここに戻す
const DEFAULT_COLOR: string = COMMENT_COLORS.WHITE;
const DEFAULT_SIZE: CommentSize = 'medium';
const DEFAULT_SPEED: SpeedOption = 'normal';
const DEFAULT_ANIMATION: CommentAnimation = 'none';

// 職人設定のメニューに並べる選択肢
const COLOR_OPTIONS = (
  Object.entries(COMMENT_COLORS) as [keyof typeof COMMENT_COLORS, string][]
).map(([name, value]) => ({
  value,
  label: COLOR_LABELS[name],
  swatch: value,
}));
const SIZE_OPTIONS = COMMENT_SIZE_OPTIONS.map((value) => ({
  value,
  label: SIZE_LABELS[value],
}));
const SPEED_MENU_OPTIONS = SPEED_OPTIONS.map((value) => ({
  value,
  label: SPEED_LABELS[value],
}));
const ANIMATION_OPTIONS = COMMENT_ANIMATIONS.map((value) => ({
  value,
  label: ANIMATION_LABELS[value],
}));

export function CommentForm({ onSubmit, disabled = false }: CommentFormProps) {
  const [savedSettings] = useState(() => loadCommentStyleSettings());
  const [content, setContent] = useState('');
  const [color, setColor] = useState<string>(
    savedSettings?.color ?? DEFAULT_COLOR
  );
  const [size, setSize] = useState<CommentSize>(
    savedSettings?.size ?? DEFAULT_SIZE
  );
  const [speedOption, setSpeedOption] = useState<SpeedOption>(
    savedSettings?.speedOption ?? DEFAULT_SPEED
  );
  const [animation, setAnimation] = useState<CommentAnimation>(
    savedSettings?.animation ?? DEFAULT_ANIMATION
  );
  const [shouldPersist, setShouldPersist] = useState(savedSettings !== null);
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

  useEffect(() => {
    if (shouldPersist) {
      saveCommentStyleSettings({ color, size, speedOption, animation });
    } else {
      clearCommentStyleSettings();
    }
  }, [shouldPersist, color, size, speedOption, animation]);

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

  // 盛り上げモード中はスタイルがランダムになるので、個別の設定メニューは触れないようにする
  const toggleDanmakuMode = () => {
    setIsDanmakuMode((current) => !current);
  };

  // すべて初期値のときはリセットしても何も変わらないので、ボタンは押せなくしておく
  const isDefaultStyle =
    color === DEFAULT_COLOR &&
    size === DEFAULT_SIZE &&
    speedOption === DEFAULT_SPEED &&
    animation === DEFAULT_ANIMATION &&
    !isDanmakuMode;

  const resetStyle = () => {
    setColor(DEFAULT_COLOR);
    setSize(DEFAULT_SIZE);
    setSpeedOption(DEFAULT_SPEED);
    setAnimation(DEFAULT_ANIMATION);
    setIsDanmakuMode(false);
  };

  const previewShadowColor = color === COMMENT_COLORS.WHITE ? '#000' : '#FFF';
  const previewText = content.trim();

  return (
    <SectionBase className="comment-form-section">
      <form className="comment-form" onSubmit={handleSubmit}>
        {/* エディタ風の構成: 上段に今の職人設定を 1 個ずつチップで並べ、押すとメニューが開いて
            選択肢を選べる。下段は入力欄と送信ボタン。全体を .comment-composer のひとつの枠にまとめる */}
        <div className="comment-composer">
          <div className="composer-settings">
            {/* 色は今の色の四角だけを見せる */}
            <SettingMenu
              label="色"
              options={COLOR_OPTIONS}
              value={color}
              onChange={setColor}
              disabled={isDanmakuMode}
              showValueText={false}
            />
            <SettingMenu
              label="サイズ"
              icon={<TextSizeIcon />}
              options={SIZE_OPTIONS}
              value={size}
              onChange={setSize}
              disabled={isDanmakuMode}
            />
            <SettingMenu
              label="速度"
              icon={<SpeedIcon />}
              options={SPEED_MENU_OPTIONS}
              value={speedOption}
              onChange={setSpeedOption}
              disabled={isDanmakuMode}
            />
            <SettingMenu
              label="アニメーション"
              icon={<SparklesIcon />}
              options={ANIMATION_OPTIONS}
              value={animation}
              onChange={setAnimation}
              disabled={isDanmakuMode}
            />
            <button
              type="button"
              className="danmaku-chip"
              aria-label="盛り上げモード"
              data-tooltip="盛り上げモード"
              aria-pressed={isDanmakuMode}
              onClick={toggleDanmakuMode}
              disabled={disabled}
            >
              <BoltIcon />
            </button>

            <label className="persist-chip">
              <input
                type="checkbox"
                checked={shouldPersist}
                onChange={(event) => setShouldPersist(event.target.checked)}
              />
              設定を保存
            </label>

            {/* 職人設定をワンタッチで初期値に戻す */}
            <button
              type="button"
              className="composer-reset"
              aria-label="設定をリセット"
              data-tooltip="設定をリセット"
              disabled={isDefaultStyle}
              onClick={resetStyle}
            >
              <ClearFormatIcon />
            </button>
          </div>

          <div
            className="comment-preview"
            aria-label="コメントのプレビュー"
            aria-live="polite"
          >
            {isDanmakuMode ? (
              <p className="comment-preview-note">
                コメントを一気に送信して、画面を盛り上げます！
              </p>
            ) : !previewText ? (
              <p className="comment-preview-note">
                コメントを入力するとプレビューできます
              </p>
            ) : (
              <span
                key={`${previewText}-${color}-${size}-${animation}`}
                className="comment-preview-track"
              >
                <span
                  className={`comment-preview-text comment-preview-animation-${animation}`}
                  style={{
                    color,
                    fontSize: `${COMMENT_SIZES[size] * PREVIEW_SIZE_SCALE}px`,
                    textShadow: `-1px -1px 0 ${previewShadowColor}, 1px -1px 0 ${previewShadowColor}, -1px 1px 0 ${previewShadowColor}, 1px 1px 0 ${previewShadowColor}, 0 0 4px ${previewShadowColor}`,
                  }}
                >
                  {previewText}
                </span>
              </span>
            )}
          </div>

          {/* 入力してすぐ送れるように、入力欄と送信ボタンは同じ行に置く */}
          <div className="composer-input-row">
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
            <button
              type="submit"
              disabled={disabled || !content.trim() || cooldownRemaining > 0}
              className="submit-button"
              aria-label="コメントを送信"
            >
              {cooldownRemaining > 0 ? `送信 (${cooldownRemaining}秒)` : '送信'}
            </button>
          </div>
        </div>
      </form>
    </SectionBase>
  );
}
