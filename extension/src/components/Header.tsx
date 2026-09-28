import React from 'react';
import { Shield, Settings } from 'lucide-react';

interface HeaderProps {
  onToggleSettings?: () => void;
  showSettings?: boolean;
  title?: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSettings,
  showSettings = false,
  title = 'SHADOWBROWSE',
  subtitle = 'Privacy & Anonymity Layer',
}) => {
  return (
    <header className="sb-header">
      <div className="flex items-center gap-2">
        <div className="sb-brand-mark" aria-hidden="true">
          <Shield style={{ width: 15, height: 15 }} />
        </div>
        <div>
          <h1 className="sb-brand-title">{title}</h1>
          <p className="sb-brand-subtitle">{subtitle}</p>
        </div>
      </div>

      {onToggleSettings && (
        <button
          type="button"
          onClick={onToggleSettings}
          title={showSettings ? 'Close Settings' : 'Quick Settings'}
          aria-label={showSettings ? 'Close Settings' : 'Quick Settings'}
          className="sb-header-btn"
        >
          <Settings style={{ width: 14, height: 14 }} />
        </button>
      )}
    </header>
  );
};
