import React from 'react';

interface MetricRowProps {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const MetricRow: React.FC<MetricRowProps> = ({ label, icon, children, className = '' }) => {
  return (
    <div className={`sb-metric-row ${className}`.trim()}>
      <span className="sb-metric-label">
        {icon && <span className="flex items-center text-muted">{icon}</span>}
        <span>{label}</span>
      </span>
      <span className="sb-metric-value">{children}</span>
    </div>
  );
};
