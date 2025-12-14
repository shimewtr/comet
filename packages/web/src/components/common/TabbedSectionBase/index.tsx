import { type ReactNode, useState } from 'react';
import './style.scss';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabbedSectionBaseProps {
  title: string;
  tabs: Tab[];
  defaultTab?: string;
  disabled?: boolean;
  className?: string;
}

export function TabbedSectionBase({
  title,
  tabs,
  defaultTab,
  disabled = false,
  className = '',
}: TabbedSectionBaseProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');

  const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div className={`section-base tabbed-section-base ${className}`}>
      <div className="section-header">
        <h3>{title}</h3>
      </div>

      <div className="section-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`section-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            disabled={disabled}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="section-content">{activeTabContent}</div>
    </div>
  );
}
