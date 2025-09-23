import React from 'react';

type BannerType = 'info' | 'success' | 'warning' | 'error';

const map: Record<BannerType, { wrapper: string; label: string } > = {
  info:    { wrapper: 'bg-blue-50 border border-blue-200 text-blue-800', label: 'Info' },
  success: { wrapper: 'bg-green-50 border border-green-200 text-green-800', label: 'Success' },
  warning: { wrapper: 'bg-yellow-50 border border-yellow-200 text-yellow-800', label: 'Warning' },
  error:   { wrapper: 'bg-red-50 border border-red-200 text-red-800', label: 'Error' },
};

export function Banner({ type='info', children, onClose }: { type?: BannerType; children: React.ReactNode; onClose?: () => void }) {
  const { wrapper, label } = map[type];
  return (
    <div className={`rounded px-2 py-1 text-sm flex items-center justify-between ${wrapper}`} role="status" aria-live="polite">
      <span><strong className="mr-1">{label}:</strong> {children}</span>
      {onClose && (
        <button type="button" className="underline" onClick={onClose} aria-label="Close">Dismiss</button>
      )}
    </div>
  );
}

