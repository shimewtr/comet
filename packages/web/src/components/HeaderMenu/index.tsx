import { useEffect, useId, useRef, useState } from 'react';
import { MoreIcon } from '../../assets/icons/MoreIcon';
import './style.scss';

interface HeaderMenuActionItem {
  label: string;
  onSelect: () => void;
}

interface HeaderMenuLinkItem {
  label: string;
  href: string;
}

/** ボタン（onSelect）かリンク（href）のどちらか */
export type HeaderMenuItem = HeaderMenuActionItem | HeaderMenuLinkItem;

interface HeaderMenuProps {
  items: HeaderMenuItem[];
  label?: string;
}

/**
 * ヘッダー右端の「…」メニュー。履歴への導線や管理系の操作をここに逃がす。
 * 外側クリックと Escape で閉じる
 */
export function HeaderMenu({
  items,
  label = 'その他のメニュー',
}: HeaderMenuProps) {
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

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        type="button"
        className="header-menu-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreIcon />
      </button>

      {open && (
        <div className="header-menu-list" role="menu" id={menuId}>
          {items.map((item) =>
            'href' in item ? (
              <a
                key={item.label}
                role="menuitem"
                className="header-menu-item"
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="header-menu-item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
