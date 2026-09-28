import React from 'react';
import { PrivacyState, ProtectionLevel, TorStatus } from '../shared/types';

interface StatusDotProps {
  status?: PrivacyState | ProtectionLevel | TorStatus | string;
  isAnimated?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status = 'OFF',
  isAnimated = false,
  className = '',
  size = 'md',
}) => {
  const norm = String(status).toUpperCase();

  let dotVariant = 'inactive';

  if (norm === 'PROTECTED' || norm === 'CONNECTED' || norm === 'ACTIVE') {
    dotVariant = 'protected';
  } else if (norm === 'PARTIAL' || norm === 'PARTIALLY_PROTECTED' || norm === 'DEGRADED' || norm === 'WARNING') {
    dotVariant = 'partial';
  } else if (norm === 'STARTING' || norm === 'BOOTSTRAPPING' || norm === 'STOPPING') {
    dotVariant = 'info';
  } else if (norm === 'FAILED' || norm === 'CONNECTION_FAILED' || norm === 'LEAK_DETECTED') {
    dotVariant = 'failed';
  } else {
    dotVariant = 'inactive';
  }

  const shouldAnimate = isAnimated || norm === 'STARTING' || norm === 'BOOTSTRAPPING' || norm === 'STOPPING';
  const sizeStyle = size === 'sm' ? { width: 6, height: 6 } : {};

  return (
    <span
      className={`sb-status-dot ${dotVariant} ${shouldAnimate ? 'animating' : ''} ${className}`.trim()}
      style={sizeStyle}
      aria-hidden="true"
    />
  );
};
