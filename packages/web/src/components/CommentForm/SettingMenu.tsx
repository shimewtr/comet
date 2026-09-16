import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CheckIcon } from '../../assets/icons/CheckIcon';

export interface SettingMenuOption<T extends string> {
  value: T;
  label: string;
  /** 色の選択肢のように、見本の色を添えたいときに指定する */
  swatch?: string;
}

interface SettingMenuProps<T extends string> {
  /** 設定名。読み上げとツールチップに使う */
  label: string;
  /** 設定名の代わりにチップへ出すアイコン */
  icon?: ReactNode;
  options: SettingMenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** false にすると現在値の文字を出さず、色見本だけで現在値を示す */
  showValueText?: boolean;
}

/**
 * 職人設定 1 個ぶんのチップ。アイコンと現在値を表示し、押すと下にメニューが開いて選択肢を選べる。
 * 選ぶと閉じる。外側クリックと Escape でも閉じる
 */
export function SettingMenu<T extends string>({
  label,
  icon,
  options,
  value,
  onChange,
  disabled = false,
  showValueText = true,
}: SettingMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // 盛り上げモードなどで無効になったら、開いていたメニューは閉じる
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const current = options.find((option) => option.value === value);
  const valueText = current?.label ?? value;

  return (
    <div className="setting-menu" ref={rootRef}>
      <button
        type="button"
        className="setting-chip"
        aria-label={`${label}: ${valueText}`}
        // 現在値の文字を出していないチップ（色）だけ、ツールチップに値も添える
        data-tooltip={showValueText ? label : `${label}: ${valueText}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {icon && <span className="setting-chip-icon">{icon}</span>}
        <span className="setting-chip-value">
          {current?.swatch && (
            <span
              className="setting-swatch"
              style={{ backgroundColor: current.swatch }}
            />
          )}
          {showValueText && valueText}
        </span>
      </button>

      {open && (
        <div
          className="setting-menu-list"
          role="menu"
          aria-label={label}
          id={menuId}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className="setting-menu-item"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="setting-menu-check" aria-hidden="true">
                  {selected && <CheckIcon />}
                </span>
                {option.swatch && (
                  <span
                    className="setting-swatch"
                    style={{ backgroundColor: option.swatch }}
                  />
                )}
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
