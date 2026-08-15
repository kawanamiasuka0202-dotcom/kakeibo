'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { addMonthKey, compareMonthKey, monthKeyLabel, monthKeyOf, type MonthKey } from '@/lib/date';
import { formatYen, formatYenText } from '@/lib/money';
import type { BudgetLevel } from '@/lib/budget';
import type { ViewerFilter } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-1">
        {back ? (
          <Link
            href={back}
            aria-label="戻る"
            className="-ml-2 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
          >
            <ChevronLeft className="size-6" />
          </Link>
        ) : null}
        {/* 見出しは少し内側に寄せ、色を付けて画面の区切りを分かりやすくする */}
        <div className={cn('min-w-0 border-l-4 border-primary pl-2.5', !back && 'ml-1')}>
          <h1 className="truncate text-xl font-bold text-primary">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** 月の切り替え。未来の月へは今月+12ヶ月まで移動できる。 */
export function MonthSwitcher({
  monthKey,
  onChange,
  today,
  monthStartDay,
  className,
}: {
  monthKey: MonthKey;
  onChange: (key: MonthKey) => void;
  today: string;
  monthStartDay: number;
  className?: string;
}) {
  const current = monthKeyOf(today, monthStartDay);
  const isCurrent = compareMonthKey(monthKey, current) === 0;
  const canGoNext = compareMonthKey(monthKey, addMonthKey(current, 12)) < 0;

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="前の月"
        onClick={() => onChange(addMonthKey(monthKey, -1))}
      >
        <ChevronLeft className="size-6" />
      </Button>
      <button
        type="button"
        onClick={() => onChange(current)}
        className="flex flex-col items-center px-2 py-1"
      >
        <span className="text-lg font-bold">{monthKeyLabel(monthKey)}</span>
        {!isCurrent ? <span className="text-[11px] text-primary">今月に戻る</span> : null}
      </button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="次の月"
        disabled={!canGoNext}
        onClick={() => onChange(addMonthKey(monthKey, 1))}
      >
        <ChevronRight className="size-6" />
      </Button>
    </div>
  );
}

/** 共有モードでの「2人合計 / 自分 / パートナー」切り替え */
export function ViewerSwitch({
  value,
  onChange,
  partnerName,
  className,
}: {
  value: ViewerFilter;
  onChange: (v: ViewerFilter) => void;
  partnerName: string;
  className?: string;
}) {
  const options: { id: ViewerFilter; label: string }[] = [
    { id: 'all', label: '2人合計' },
    { id: 'me', label: '自分' },
    { id: 'partner', label: partnerName },
  ];
  return (
    <div
      role="tablist"
      aria-label="表示対象"
      className={cn('flex gap-1 rounded-xl bg-surface-muted p-1', className)}
    >
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-sm font-semibold transition-colors',
            value === o.id ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const LEVEL_STYLE: Record<BudgetLevel, string> = {
  none: 'border-border bg-surface-muted text-foreground',
  safe: 'border-success/30 bg-success-soft text-success',
  warn: 'border-warn/40 bg-warn-soft text-warn',
  over: 'border-danger/40 bg-danger-soft text-danger',
};

/** 予算の状況を文章で伝える警告。グラフだけに頼らないための表示。 */
export function BudgetAlert({
  level,
  usageRate,
  remainingYen,
  onDismiss,
}: {
  level: BudgetLevel;
  usageRate: number;
  remainingYen: number;
  onDismiss?: () => void;
}) {
  if (level === 'none' || level === 'safe') return null;

  const message =
    level === 'over'
      ? `予算を${formatYenText(Math.abs(remainingYen))}超えています（使用率${usageRate}%）。`
      : `予算の${usageRate}%を使いました。残りは${formatYenText(remainingYen)}です。`;

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-card border p-3 text-sm font-semibold', LEVEL_STYLE[level])}
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0" />
      <p className="min-w-0 flex-1 leading-relaxed">{message}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 text-xs underline">
          閉じる
        </button>
      ) : null}
    </div>
  );
}

/** 金額を大きく見せる表示。マイナスは色を変えて明示する。 */
export function AmountDisplay({
  value,
  size = 'lg',
  className,
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
  };
  return (
    <span
      className={cn(
        'tabular font-bold',
        sizes[size],
        value < 0 ? 'text-danger' : 'text-foreground',
        className,
      )}
    >
      {formatYen(value)}
    </span>
  );
}

export function StatRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'danger' | 'primary';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 text-right">
        <span
          className={cn(
            'tabular font-bold',
            tone === 'danger' ? 'text-danger' : tone === 'primary' ? 'text-primary' : '',
          )}
        >
          {value}
        </span>
        {hint ? <span className="ml-2 text-xs text-muted">{hint}</span> : null}
      </span>
    </div>
  );
}
