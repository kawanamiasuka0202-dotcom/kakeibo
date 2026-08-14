'use client';

import * as React from 'react';
import { Shuffle, Users } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { BackendError } from '@/lib/data/backend';
import {
  suggestPassphrase,
  validateLoginName,
  validatePassphrase,
} from '@/lib/passphrase';

/**
 * 最初の画面。メールアドレスもパスワードも使わず、
 * 「2人で決めた合言葉」と「お名前」だけで始める。
 */
export default function StartPage() {
  const { startWithPassphrase, enterDemo, hasSupabase, savedPassphrase } = useApp();
  const toast = useToast();

  const [passphrase, setPassphrase] = React.useState('');
  const [name, setName] = React.useState('');
  const [errors, setErrors] = React.useState<{ passphrase?: string; name?: string }>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (savedPassphrase) setPassphrase(savedPassphrase);
  }, [savedPassphrase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const next = {
      passphrase: validatePassphrase(passphrase) ?? undefined,
      name: validateLoginName(name) ?? undefined,
    };
    setErrors(next);
    if (next.passphrase || next.name) return;

    setBusy(true);
    try {
      await startWithPassphrase({
        passphrase,
        loginName: name.trim(),
        displayName: name.trim(),
      });
    } catch (e) {
      const message =
        e instanceof BackendError || e instanceof Error ? e.message : '始められませんでした';
      toast.show(message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4 py-6">
      <div className="text-center">
        <Users className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-2xl font-bold">家計簿</h1>
        <p className="mt-1 text-sm text-muted">
          メールアドレスもパスワードも使いません。
          <br />
          合言葉とお名前だけで始められます。
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field
            label="家計の合言葉"
            htmlFor="passphrase"
            error={errors.passphrase}
            hint="2人で同じ言葉を入れると、同じ家計簿を一緒に使えます。8文字以上。"
          >
            <Input
              id="passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="わがや-さくら-2026"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPassphrase(suggestPassphrase())}
          >
            <Shuffle className="size-4" />
            合言葉の候補を出す
          </Button>

          <Field
            label="お名前"
            htmlFor="name"
            error={errors.name}
            hint="家計簿に「誰が払ったか」を表示するために使います。入り直すときにも必要です。"
          >
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="たろう"
              maxLength={20}
              autoComplete="off"
            />
          </Field>

          <Button type="submit" size="block" disabled={busy || !hasSupabase}>
            {busy ? '準備しています…' : 'はじめる'}
          </Button>
        </form>

        <div className="mt-4 space-y-2 rounded-xl bg-surface-muted p-3 text-xs leading-relaxed text-muted">
          <p>
            <span className="font-bold text-foreground">1人目</span>
            ：新しい家計簿ができます。合言葉をパートナーに伝えてください。
          </p>
          <p>
            <span className="font-bold text-foreground">2人目</span>
            ：同じ合言葉と、自分のお名前を入れると参加できます。
          </p>
          <p>
            <span className="font-bold text-foreground">機種変更のとき</span>
            ：同じ合言葉と同じお名前を入れれば、これまでのデータのまま続けられます。
          </p>
          <p>合言葉を知っている人は家計簿を見られます。他の人に教えないでください。</p>
        </div>
      </Card>

      {!hasSupabase ? (
        <Card className="border-warn/40 bg-warn-soft">
          <p className="text-sm">
            Supabase の設定がまだのため、2人での共有は使えません。
            まずはデモモードでお試しください。
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>まず試してみる</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-muted">
          サンプルの家計データで、すべての画面を試せます。
          データはこの端末のブラウザにだけ保存されます。
        </p>
        <Button variant="outline" size="block" onClick={enterDemo}>
          デモモードで見る
        </Button>
      </Card>
    </div>
  );
}
