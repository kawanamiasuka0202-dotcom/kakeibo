'use client';

import * as React from 'react';
import { CheckCircle2, Info, TriangleAlert, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  /** 「元に戻す」を押したときの処理。指定すると取り消しボタンが出る */
  onUndo?: () => void;
  duration: number;
}

interface ToastContextValue {
  show: (message: string, options?: { tone?: ToastTone; onUndo?: () => void; duration?: number }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** 削除の取り消しを受け付ける時間（ミリ秒） */
export const UNDO_DURATION_MS = 7000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const seq = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback<ToastContextValue['show']>(
    (message, options) => {
      const id = ++seq.current;
      const duration = options?.duration ?? (options?.onUndo ? UNDO_DURATION_MS : 3200);
      setItems((prev) => [...prev.slice(-2), { id, message, tone: options?.tone ?? 'info', onUndo: options?.onUndo, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-3"
        style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg animate-slide-up',
              t.tone === 'error'
                ? 'bg-danger text-white'
                : t.tone === 'success'
                  ? 'bg-success text-white'
                  : 'bg-foreground text-background',
            )}
          >
            {t.tone === 'error' ? (
              <TriangleAlert className="size-5 shrink-0" />
            ) : t.tone === 'success' ? (
              <CheckCircle2 className="size-5 shrink-0" />
            ) : (
              <Info className="size-5 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
            {t.onUndo ? (
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 font-bold"
                onClick={() => {
                  t.onUndo?.();
                  dismiss(t.id);
                }}
              >
                <Undo2 className="size-4" />
                元に戻す
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast は ToastProvider の内側で使ってください');
  return ctx;
}
