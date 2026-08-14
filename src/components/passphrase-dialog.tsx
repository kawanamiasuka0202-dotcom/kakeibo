'use client';

import * as React from 'react';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { suggestPassphrase, validatePassphrase } from '@/lib/passphrase';

/** 新しい合言葉を入力してもらうダイアログ（合言葉の変更・パートナー解除で使う） */
export function PassphraseDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  onSubmit: (passphrase: string) => Promise<void>;
}) {
  const toast = useToast();
  const [value, setValue] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValue('');
      setConfirm('');
      setError(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const invalid = validatePassphrase(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (value.trim() !== confirm.trim()) {
      setError('確認用の合言葉が一致しません');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(value.trim());
      onOpenChange(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '変更できませんでした', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {description ? <div className="text-sm text-muted">{description}</div> : null}

          <Field label="新しい合言葉" htmlFor="new-passphrase" error={error ?? undefined}>
            <Input
              id="new-passphrase"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="わがや-さくら-2026"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          </Field>

          <Button type="button" variant="ghost" size="sm" onClick={() => setValue(suggestPassphrase())}>
            <Shuffle className="size-4" />
            候補を出す
          </Button>

          <Field label="もう一度入力" htmlFor="new-passphrase-confirm">
            <Input
              id="new-passphrase-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>

          <p className="rounded-xl bg-surface-muted p-3 text-xs leading-relaxed text-muted">
            変更したあとは、この合言葉とお名前で入り直すことになります。忘れないようにご注意ください。
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="block"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              キャンセル
            </Button>
            <Button type="submit" size="block" disabled={busy}>
              {busy ? '変更しています…' : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
