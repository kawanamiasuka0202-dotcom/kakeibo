'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  // 説明文が無いダイアログでは aria-describedby を明示的に外す（見出しの二重読み上げを避ける）
  const describedBy = description ? {} : { 'aria-describedby': undefined };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 shadow-xl animate-slide-up',
          'sm:inset-y-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
          'max-h-[90dvh] overflow-y-auto',
          className,
        )}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        {...describedBy}
        {...props}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" aria-label="閉じる">
              <X className="size-5" />
            </Button>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** 削除など、取り返しがつかない操作の前に必ず出す確認ダイアログ */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '削除する',
  cancelLabel = 'キャンセル',
  destructive = true,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <div className="space-y-4">
          <div className="text-sm leading-relaxed text-foreground">{description}</div>
          <div className="flex flex-col gap-2">
            <Button
              variant={destructive ? 'danger' : 'primary'}
              size="block"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? '処理中…' : confirmLabel}
            </Button>
            <Button variant="ghost" size="block" onClick={() => onOpenChange(false)} disabled={busy}>
              {cancelLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
