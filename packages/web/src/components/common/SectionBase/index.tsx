import { type ReactNode } from 'react';
import './style.scss';

interface SectionBaseProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionBase({ title, children, className = '' }: SectionBaseProps) {
  return (
    <div className={`section-base ${className}`}>
      <div className="section-header">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
      </div>
      <div className="section-content">
        {children}
      </div>
    </div>
  );
}
