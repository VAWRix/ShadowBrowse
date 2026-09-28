import React from 'react';
import { ProtectionLevel } from '../shared/types';

interface StatusBadgeProps {
  level?: ProtectionLevel | string;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ level, label, className = '' }) => {
  const norm = (level || 'UNKNOWN').toUpperCase();

  let badgeClass = 'sb-badge-neutral';
  let displayLabel = label || norm;

  if (norm === 'PROTECTED') {
    badgeClass = 'sb-badge-protected';
    displayLabel = label || 'PROTECTED';
  } else if (norm === 'PARTIAL' || norm === 'PARTIALLY_PROTECTED' || norm === 'WARNING') {
    badgeClass = 'sb-badge-partial';
    displayLabel = label || (norm === 'PARTIALLY_PROTECTED' ? 'PARTIAL' : norm);
  } else if (norm === 'DETECTION_ONLY' || norm === 'DETECTION ONLY') {
    badgeClass = 'sb-badge-info';
    displayLabel = label || 'DETECTION ONLY';
  } else if (norm === 'FAILED' || norm === 'LEAK_DETECTED' || norm === 'DANGER') {
    badgeClass = 'sb-badge-failed';
    displayLabel = label || (norm === 'LEAK_DETECTED' ? 'LEAK DETECTED' : 'FAILED');
  } else if (norm === 'UNVERIFIED' || norm === 'UNKNOWN' || norm === 'UNAVAILABLE') {
    badgeClass = 'sb-badge-neutral';
    displayLabel = label || norm;
  }

  return (
    <span
      className={`sb-badge ${badgeClass} ${className}`.trim()}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      {displayLabel}
    </span>
  );
};
