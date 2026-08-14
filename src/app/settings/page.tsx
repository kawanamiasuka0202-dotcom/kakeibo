'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Copy,
  Download,
  KeyRound,
  LogOut,
  Moon,
  Repeat,
  ShieldAlert,
  Tags,
} from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { PassphraseDialog } from '@/components/passphrase-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge, Switch } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { downloadCsv, transactionsToCsv } from '@/lib/csv';
import { DEFAULT_NOTIFY, STORAGE_KEYS, useLocalSetting, type NotifySetting, type ThemeSetting } from '@/lib/settings';
import { validateDisplayName } from '@/lib/validation';

export default function SettingsPage() {
  const {
    data, me, backend, run, busy, isDemo, theme, setTheme, signOut, memberName,
    savedPassphrase, changePassphrase,
  } = useHousehold();
  const toast = useToast();
  const [displayName, setDisplayName] = React.useState(me.displayName);
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [notify, setNotify] = React.useState<NotifySetting>(DEFAULT_NOTIFY);
  const [storedNotify, setStoredNotify] = useLocalSetting<NotifySetting>(
    STORAGE_KEYS.notify,
    DEFAULT_NOTIFY,
  );

  React.useEffect(() => setNotify(storedNotify), [storedNotify]);
  React.useEffect(() => setDisplayName(me.displayName), [me.displayName]);

  const partner = data.members.find((m) => m.userId !== me.id) ?? null;

  const saveDisplayName = async () => {
    if (!backend || displayName.trim() === me.displayName) return;
    const error = validateDisplayName(displayName);
    if (error) {
      toast.show(error, { tone: 'error' });
      return;
    }
    await run(() => backend.updateProfile({ displayName: displayName.trim() }), {
      success: '表示名を変更しました',
    });
  };

  const updateHousehold = async (patch: Parameters<NonNullable<typeof backend>['updateHousehold']>[0]) => {
    if (!backend) return;
    await run(() => backend.updateHousehold(patch), { success: '設定を保存しました' });
  };

  const exportCsv = () => {
    const names = new Map(data.members.map((m) => [m.userId, m.displayName]));
    downloadCsv('kakeibo_all.csv', transactionsToCsv(data.transactions, data.categories, names));
    toast.show('CSVを書き出しました', { tone: 'success' });
  };

  const copyPassphrase = async () => {
    if (!savedPassphrase) return;
    try {
      await navigator.clipboard.writeText(savedPassphrase);
      toast.show('合言葉をコピーしました', { tone: 'success' });
    } catch {
      toast.show('コピーできませんでした。長押しして選択してください。', { tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="設定" />

      {isDemo ? (
        <Card className="border-warn/40 bg-warn-soft">
          <p className="text-sm font-semibold text-warn">デモモードで利用中です</p>
          <p className="mt-1 text-sm">
            サンプルデータはこの端末のブラウザにのみ保存され、パートナーとの共有はできません。
          </p>
          <Button variant="outline" size="block" className="mt-3" onClick={signOut}>
            デモモードを終了して、合言葉で始める
          </Button>
        </Card>
      ) : null}

      {/* アカウント */}
      <Card>
        <CardHeader>
          <CardTitle>アカウント</CardTitle>
        </CardHeader>
        <Field label="表示名" htmlFor="displayName">
          <div className="flex gap-2">
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
            />
            <Button
              onClick={saveDisplayName}
              disabled={busy || displayName.trim() === me.displayName}
              className="shrink-0"
            >
              保存
            </Button>
          </div>
        </Field>
      </Card>

      {/* 家計グループ */}
      <Card>
        <CardHeader>
          <CardTitle>家計グループ</CardTitle>
          <Badge tone={data.household.mode === 'shared' ? 'primary' : 'neutral'}>
            {data.household.mode === 'shared' ? '共有モード' : '個人モード'}
          </Badge>
        </CardHeader>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">メンバー</p>
            <ul className="mt-1 space-y-1 text-sm text-muted">
              {data.members.map((m) => (
                <li key={m.userId}>
                  {memberName(m.userId)}
                  {m.userId === me.id ? '（自分）' : ''}
                  {m.role === 'owner' ? '・作成者' : ''}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-surface-muted p-3">
            <p className="text-sm font-semibold">家計の合言葉</p>
            {savedPassphrase ? (
              <>
                <p className="my-1.5 break-all text-center text-lg font-bold tracking-wide">
                  {savedPassphrase}
                </p>
                <div className="grid gap-2">
                  <Button variant="outline" size="sm" onClick={copyPassphrase}>
                    <Copy className="size-4" />
                    合言葉をコピー
                  </Button>
                  {!partner ? (
                    <Button variant="ghost" size="sm" onClick={() => setChangeOpen(true)}>
                      <KeyRound className="size-4" />
                      合言葉を変える
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted">
                この端末には合言葉が保存されていません。パートナーに参加してもらうには、
                最初に決めた合言葉をご自分でお伝えください。
              </p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {partner
                ? '2人で使っている間は合言葉を変更できません（相手が入れなくなるため）。'
                : 'この合言葉とお名前を伝えると、パートナーが同じ家計簿に参加できます。'}
            </p>
          </div>
        </div>
      </Card>

      {/* 家計のルール */}
      <Card>
        <CardHeader>
          <CardTitle>家計のルール</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <Field
            label="月の開始日"
            htmlFor="monthStartDay"
            hint={`「${data.household.monthStartDay}日 〜 翌月${data.household.monthStartDay === 1 ? '末' : `${data.household.monthStartDay - 1}日`}」を1ヶ月として集計します`}
          >
            <Select
              id="monthStartDay"
              value={String(data.household.monthStartDay)}
              disabled={busy}
              onChange={(e) => updateHousehold({ monthStartDay: Number(e.target.value) })}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}日
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">予算の繰越し</span>
              <span className="block text-xs text-muted">
                前月の未使用額（または超過額）を翌月の予算に加算します。初期状態はオフです。
              </span>
            </span>
            <Switch
              checked={data.household.carryoverEnabled}
              disabled={busy}
              onCheckedChange={(checked) => updateHousehold({ carryoverEnabled: checked })}
              aria-label="予算の繰越し"
            />
          </label>
        </div>
      </Card>

      {/* 管理 */}
      <Card className="p-0">
        <ul className="divide-y divide-border">
          <li>
            <SettingsLink href="/settings/categories" icon={<Tags className="size-5" />}>
              カテゴリの管理
            </SettingsLink>
          </li>
          <li>
            <SettingsLink href="/settings/recurring" icon={<Repeat className="size-5" />}>
              定期支出の管理
            </SettingsLink>
          </li>
        </ul>
      </Card>

      {/* 表示 */}
      <Card>
        <CardHeader>
          <CardTitle>表示</CardTitle>
        </CardHeader>
        <Field label="テーマ" htmlFor="theme">
          <Select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeSetting)}
          >
            <option value="system">端末の設定に合わせる</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </Select>
        </Field>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Moon className="size-4" />
          ダークモードは目に優しく、夜間の入力に向いています。
        </p>
      </Card>

      {/* 通知 */}
      <Card>
        <CardHeader>
          <CardTitle>通知</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-muted">
          アプリ内の警告表示の設定です。端末へのプッシュ通知は行いません。
        </p>
        <div className="space-y-3">
          <ToggleRow
            label="予算の80%に到達したら知らせる"
            checked={notify.budget80}
            onChange={(v) => setStoredNotify({ ...notify, budget80: v })}
          />
          <ToggleRow
            label="予算の100%に到達したら知らせる"
            checked={notify.budget100}
            onChange={(v) => setStoredNotify({ ...notify, budget100: v })}
          />
          <ToggleRow
            label="カテゴリ別予算の超過を知らせる"
            checked={notify.categoryOver}
            onChange={(v) => setStoredNotify({ ...notify, categoryOver: v })}
          />
        </div>
      </Card>

      {/* データ */}
      <Card>
        <CardHeader>
          <CardTitle>データ</CardTitle>
        </CardHeader>
        <Button variant="outline" size="block" onClick={exportCsv}>
          <Download className="size-5" />
          すべての記録をCSVで書き出す
        </Button>
        <p className="mt-2 text-xs text-muted">
          CSVの取り込み（インポート）は今後のバージョンで対応予定です。
        </p>
      </Card>

      {/* 危険な操作 */}
      <Card className="p-0">
        <ul className="divide-y divide-border">
          <li>
            <SettingsLink href="/settings/danger" icon={<ShieldAlert className="size-5 text-danger" />}>
              <span className="text-danger">グループの退出・アカウント削除</span>
            </SettingsLink>
          </li>
        </ul>
      </Card>

      <Button variant="ghost" size="block" onClick={signOut}>
        <LogOut className="size-5" />
        ログアウト
      </Button>

      <PassphraseDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        title="合言葉を変える"
        description="新しい合言葉を決めてください。次からはこの合言葉とお名前で入ります。"
        confirmLabel="合言葉を変える"
        onSubmit={async (next) => {
          await changePassphrase(next);
          toast.show('合言葉を変えました', { tone: 'success' });
        }}
      />

      <p className="pb-2 text-center text-xs text-muted">家計簿アプリ v1.0</p>
    </div>
  );
}

function SettingsLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-4 text-sm font-semibold">
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
