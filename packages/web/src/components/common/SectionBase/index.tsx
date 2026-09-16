import { type ReactNode } from 'react';
import './style.scss';

interface SectionBaseProps {
  /** 見出し。中身だけで役割が伝わるセクション（入力欄など）では省略する */
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionBase({
  title,
  children,
  className = '',
}: SectionBaseProps) {
  return (
    <div className={`section-base ${className}`}>
      {title !== undefined && (
        <div className="section-header">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
        </div>
      )}
      <div className="section-content">{children}</div>
    </div>
  );
}
