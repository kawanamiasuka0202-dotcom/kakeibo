'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, ShieldAlert, UserMinus } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { PassphraseDialog } from '@/components/passphrase-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { downloadCsv, transactionsToCsv } from '@/lib/csv';
import { deriveCredentials } from '@/lib/passphrase';
import { STORAGE_KEYS, writeLocal } from '@/lib/settings';
import { getSupabaseClient } from '@/lib/supabase/client';

type DangerAction = 'remove-partner' | 'leave' | 'delete-account';

export default function DangerPage() {
  const { data, me, backend, run, busy, signOut, reload } = useHousehold();
  const router = useRouter();
  const toast = useToast();
  const [action, setAction] = React.useState<DangerAction | null>(null);
  const [confirmText, setConfirmText] = React.useState('');
  const [removeOpen, setRemoveOpen] = React.useState(false);

  const partner = data.members.find((m) => m.userId !== me.id) ?? null;
  const isLastMember = data.members.length <= 1;

  const exportBackup = () => {
    const names = new Map(data.members.map((m) => [m.userId, m.displayName]));
    downloadCsv('kakeibo_backup.csv', transactionsToCsv(data.transactions, data.categories, names));
    toast.show('CSVを書き出しました', { tone: 'success' });
  };

  const execute = async () => {
    if (!backend) return;
    const current = action;
    setAction(null);
    setConfirmText('');

    if (current === 'remove-partner' && partner) {
      // 解除だけでは相手が同じ合言葉で入り直せてしまうため、新しい合言葉を決めてもらう
      setRemoveOpen(true);
      return;
    }
    if (current === 'leave') {
      const result = await run(() => backend.leaveHousehold(isLastMember));
      if (result !== null) router.replace('/start');
      return;
    }
    if (current === 'delete-account') {
      const result = await run(() => backend.deleteAccount());
      if (result !== null) {
        toast.show('アカウントを削除しました', { tone: 'success' });
        await signOut();
      }
    }
  };

  const dialogs: Record<DangerAction, { title: string; description: React.ReactNode; label: string }> = {
    'remove-partner': {
      title: 'パートナーを解除しますか？',
      description: (
        <div className="space-y-2">
          <p>
            {partner?.displayName} さんはこの家計グループから外れ、データを見られなくなります。
          </p>
          <p>
            <span className="font-bold">これまでの記録は残ります。</span>
            相手が登録した支出・貯金・コメント・Todo もそのまま残り、あなたが引き続き閲覧・編集できます。
          </p>
          <p>
            このあと<span className="font-bold">新しい合言葉を決めていただきます</span>
            （そのままだと、相手が同じ合言葉で入り直せてしまうため）。
          </p>
        </div>
      ),
      label: '次へ（新しい合言葉を決める）',
    },
    leave: {
      title: isLastMember ? 'この家計グループを削除しますか？' : 'このグループから退出しますか？',
      description: isLastMember ? (
        <div className="space-y-2">
          <p className="font-bold text-danger">
            あなたが最後のメンバーのため、家計グループとすべてのデータが削除されます。
          </p>
          <p>
            支出{data.transactions.length}件、貯金目標{data.savingsGoals.length}件、コメント
            {data.comments.length}件、Todo{data.todos.length}件が削除され、元に戻せません。
          </p>
          <p>必要な場合は、先にCSVで書き出してください。</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p>あなたはこのグループから抜け、共有データを見られなくなります。</p>
          <p>
            <span className="font-bold">共有データは削除されません。</span>
            残ったメンバーが引き続き利用します。
          </p>
          <p>退出後は、新しく自分の家計グループを作る画面に移動します。</p>
        </div>
      ),
      label: isLastMember ? 'グループとデータを削除する' : 'グループから退出する',
    },
    'delete-account': {
      title: 'アカウントを削除しますか？',
      description: (
        <div className="space-y-2">
          <p className="font-bold text-danger">この操作は取り消せません。</p>
          {isLastMember ? (
            <p>家計グループとすべてのデータ（支出・予算・貯金・コメント・Todo）が削除されます。</p>
          ) : (
            <p>
              共有データは残り、{partner?.displayName} さんが引き続き利用します。
              あなたのログイン情報とプロフィールのみ削除されます。
            </p>
          )}
          <p>必要な場合は、先にCSVで書き出してください。</p>
        </div>
      ),
      label: 'アカウントを削除する',
    },
  };

  const current = action ? dialogs[action] : null;
  const needsTyping = action === 'delete-account' || (action === 'leave' && isLastMember);

  return (
    <div className="space-y-4">
      <PageHeader title="退出・削除" back="/settings" />

      <Card className="border-warn/40 bg-warn-soft">
        <p className="flex items-start gap-2 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
          <span>
            ここでの操作はデータの取り扱いが変わります。実行前に内容を必ずご確認ください。
            心配な場合は先にCSVで書き出しておくと安心です。
          </span>
        </p>
        <Button variant="outline" size="block" className="mt-3" onClick={exportBackup}>
          <Download className="size-5" />
          先にCSVで書き出す
        </Button>
      </Card>

      {partner ? (
        <Card>
          <CardHeader>
            <CardTitle>パートナーの解除</CardTitle>
          </CardHeader>
          <p className="mb-3 text-sm text-muted">
            {partner.displayName} さんを家計グループから外します。これまでの記録は残ります。
          </p>
          <Button variant="outline" size="block" onClick={() => setAction('remove-partner')} disabled={busy}>
            <UserMinus className="size-5" />
            パートナーを解除する
          </Button>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>家計グループの退出</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-muted">
          {isLastMember
            ? 'あなたが最後のメンバーのため、退出するとデータも削除されます。'
            : '共有データを残したまま、自分だけがグループから抜けます。'}
        </p>
        <Button variant="outline" size="block" onClick={() => setAction('leave')} disabled={busy}>
          <LogOut className="size-5" />
          グループから退出する
        </Button>
      </Card>

      <Card className="border-danger/30">
        <CardHeader>
          <CardTitle className="text-danger">アカウントの削除</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-muted">
          ログイン情報を含めて削除します。取り消しはできません。
        </p>
        <Button variant="danger" size="block" onClick={() => setAction('delete-account')} disabled={busy}>
          アカウントを削除する
        </Button>
      </Card>

      <PassphraseDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="新しい合言葉を決める"
        description={
          partner
            ? `${partner.displayName} さんを解除すると同時に、家計の合言葉を新しくします。`
            : undefined
        }
        confirmLabel="解除して合言葉を変える"
        onSubmit={async (next) => {
          if (!backend || !partner) return;
          const creds = await deriveCredentials(next, me.loginName?.trim() || me.displayName);
          const updated = await getSupabaseClient().auth.updateUser({
            email: creds.email,
            password: creds.password,
          });
          if (updated.error) throw new Error(`合言葉を変更できませんでした: ${updated.error.message}`);
          await backend.removePartner(partner.userId, creds.householdHash);
          writeLocal(STORAGE_KEYS.passphrase, next);
          await reload();
          toast.show('パートナーを解除し、合言葉を変えました', { tone: 'success' });
        }}
      />

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(v) => {
          if (!v) {
            setAction(null);
            setConfirmText('');
          }
        }}
        title={current?.title ?? ''}
        description={
          <div className="space-y-3">
            {current?.description}
            {needsTyping ? (
              <div>
                <p className="mb-1 text-sm font-semibold">
                  確認のため「削除する」と入力してください
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="削除する"
                  aria-label="確認の入力"
                />
              </div>
            ) : null}
          </div>
        }
        confirmLabel={current?.label ?? '実行する'}
        onConfirm={() => {
          if (needsTyping && confirmText.trim() !== '削除する') {
            toast.show('確認の入力が一致しません', { tone: 'error' });
            return;
          }
          void execute();
        }}
        busy={busy}
      />
    </div>
  );
}
