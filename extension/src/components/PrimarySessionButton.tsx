import React from 'react';
import { Shield, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { PrivacyState } from '../shared/types';

interface PrimarySessionButtonProps {
  state: PrivacyState | null;
  actionInProgress: boolean;
  onToggle: () => void;
  className?: string;
}

export const PrimarySessionButton: React.FC<PrimarySessionButtonProps> = ({
  state,
  actionInProgress,
  onToggle,
  className = '',
}) => {
  const isBusy = state === null || state === 'STARTING' || state === 'STOPPING' || actionInProgress;
  const isProtectedOrDegraded = state === 'PROTECTED' || state === 'DEGRADED';
  const isFailed = state === 'FAILED';

  let btnClass = 'sb-btn-start';
  let icon = <ShieldCheck style={{ width: 15, height: 15 }} />;
  let label = 'START PRIVATE SESSION';

  if (isBusy) {
    btnClass = 'sb-btn-secondary';
    icon = <RefreshCw className="sb-spinner" style={{ width: 14, height: 14 }} />;
    if (state === null) label = 'CONNECTING...';
    else if (state === 'STARTING') label = 'ESTABLISHING ROUTE...';
    else if (state === 'STOPPING') label = 'CLEANING SESSION DATA...';
    else label = 'PROCESSING...';
  } else if (isProtectedOrDegraded) {
    btnClass = 'sb-btn-stop';
    icon = <Shield style={{ width: 14, height: 14, opacity: 0.85 }} />;
    label = 'END PRIVATE SESSION';
  } else if (isFailed) {
    btnClass = 'sb-btn-retry';
    icon = <AlertTriangle style={{ width: 15, height: 15 }} />;
    label = 'RETRY CONNECTION';
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isBusy}
      className={`sb-btn ${btnClass} w-full ${className}`.trim()}
      aria-label={label}
      aria-live="polite"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
