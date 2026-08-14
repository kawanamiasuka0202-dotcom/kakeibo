'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, NotebookPen, PiggyBank, MessageSquare, Settings, PlusCircle } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

// 一番左が入力。開いてすぐ登録できるようにするため。
const TABS = [
  { href: '/', label: '入力', icon: PlusCircle },
  { href: '/home', label: 'ホーム', icon: Home },
  { href: '/expenses', label: '家計簿', icon: NotebookPen },
  { href: '/savings', label: '貯金', icon: PiggyBank },
  { href: '/share', label: '共有', icon: MessageSquare },
  { href: '/settings', label: '設定', icon: Settings },
] as const;

const CHROME_LESS_PREFIXES = ['/start'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, error, reload, data } = useApp();
  const pathname = usePathname();
  const bare = CHROME_LESS_PREFIXES.some((p) => pathname.startsWith(p));

  if (status === 'loading') {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-6 safe-x safe-top">
        <LoadingBlock />
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 safe-x safe-top">
        <ErrorState message={error ?? 'データの読み込みに失敗しました'} onRetry={() => void reload()} />
      </main>
    );
  }

  if (bare) {
    return <main className="mx-auto w-full max-w-2xl px-4 py-6 safe-x safe-top">{children}</main>;
  }

  // 認証前・初期設定前は本文を描画しない（リダイレクト待ち）
  if (status !== 'ready' || !data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-6 safe-x safe-top">
        <LoadingBlock label="画面を準備しています…" />
      </main>
    );
  }

  const unreadCount = data
    ? data.comments.filter(
        (c) =>
          c.userId !== data.me.id &&
          (!data.lastCommentReadAt || c.createdAt > data.lastCommentReadAt),
      ).length
    : 0;

  return (
    <div className="min-h-dvh">
      <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-nav safe-x safe-top">{children}</main>
      <BottomNav pathname={pathname} unreadCount={unreadCount} />
    </div>
  );
}

function BottomNav({ pathname, unreadCount }: { pathname: string; unreadCount: number }) {
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur safe-x"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-[4.25rem] flex-col items-center justify-center gap-1 text-[10px] font-bold transition-colors',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                <span className="relative">
                  <Icon className="size-5.5" strokeWidth={active ? 2.4 : 2} />
                  {tab.href === '/share' && unreadCount > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

