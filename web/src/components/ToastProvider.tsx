import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'info' | 'success' | 'warning' | 'error';
export interface ToastItem { id: number; type: ToastType; message: string; duration?: number }

interface ToastContextValue {
  show: (message: string, type?: ToastType, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [counter, setCounter] = useState(1);

  const remove = useCallback((id: number) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', durationMs = 2500) => {
    setCounter((c) => c + 1);
    const id = counter + 1;
    const item: ToastItem = { id, type, message, duration: durationMs };
    setToasts((arr) => [...arr, item]);
    if (durationMs > 0) setTimeout(() => remove(id), durationMs);
  }, [counter, remove]);

  const api = useMemo<ToastContextValue>(() => ({
    show,
    info: (m, d) => show(m, 'info', d),
    success: (m, d) => show(m, 'success', d),
    warning: (m, d) => show(m, 'warning', d),
    error: (m, d) => show(m, 'error', d),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed z-50 bottom-4 right-4 space-y-2">
          {toasts.map((t) => (
            <div key={t.id} className={`min-w-[240px] max-w-[360px] rounded shadow px-3 py-2 text-sm bg-[var(--surface)] border-l-4
              ${t.type === 'success' ? 'border-green-500' : ''}
              ${t.type === 'info' ? 'border-blue-500' : ''}
              ${t.type === 'warning' ? 'border-yellow-500' : ''}
              ${t.type === 'error' ? 'border-red-500' : ''}
            `} role="status" aria-live="polite">
              {t.message}
            </div>
          ))}
        </div>, document.body)}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

