'use client';

import * as React from 'react';
import { formatYen, formatYenCompact, shareRate } from '@/lib/money';
import { cn } from '@/lib/utils';

export interface Segment {
  id: string;
  label: string;
  color: string;
  value: number;
  icon?: string;
}

/**
 * ドーナツ型の円グラフ。
 * 色だけで判断させないため、必ず凡例（カテゴリ名・金額・割合）と組み合わせて使う。
 * ライブラリを使わず SVG で描いているのは、iPhone での表示差異と読み込みの重さを避けるため。
 */
export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  centerSub,
  size = 176,
  thickness = 18,
  emptyLabel = 'データなし',
  className,
}: {
  segments: Segment[];
  centerLabel?: string;
  centerValue?: string;
  centerSub?: string;
  size?: number;
  thickness?: number;
  emptyLabel?: string;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = 50 - thickness / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = total > 0 ? s.value / total : 0;
      const dash = fraction * circumference;
      const arc = { ...s, dash, offset };
      offset += dash;
      return arc;
    });

  const description =
    total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((s) => `${s.label} ${formatYen(s.value)} ${shareRate(s.value, total)}%`)
          .join('、')
      : emptyLabel;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={description}>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-surface-muted)"
          strokeWidth={thickness}
        />
        {arcs.map((a) => (
          <circle
            key={a.id}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeDasharray={`${a.dash} ${circumference - a.dash}`}
            strokeDashoffset={-a.offset}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {centerLabel ? <span className="text-xs font-semibold text-muted">{centerLabel}</span> : null}
        {centerValue ? (
          <span className="tabular text-xl font-bold leading-tight">{centerValue}</span>
        ) : null}
        {centerSub ? <span className="mt-0.5 text-[11px] text-muted">{centerSub}</span> : null}
      </div>
    </div>
  );
}

/** 円グラフの凡例。金額と割合を必ず文字で出す。 */
export function ChartLegend({
  segments,
  total,
  emptyLabel = 'データがありません',
  max,
}: {
  segments: Segment[];
  total: number;
  emptyLabel?: string;
  max?: number;
}) {
  const visible = max ? segments.slice(0, max) : segments;
  const rest = max ? segments.slice(max) : [];
  const restTotal = rest.reduce((s, x) => s + x.value, 0);

  if (segments.length === 0) {
    return <p className="py-2 text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="w-full min-w-0 space-y-2">
      {visible.map((s) => (
        <li key={s.id} className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          <span className="min-w-0 flex-1 truncate">
            {s.icon ? <span className="mr-1">{s.icon}</span> : null}
            {s.label}
          </span>
          <span className="tabular shrink-0 font-semibold">{formatYen(s.value)}</span>
          <span className="tabular w-12 shrink-0 text-right text-xs text-muted">
            {shareRate(s.value, total)}%
          </span>
        </li>
      ))}
      {rest.length > 0 ? (
        <li className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="size-3 shrink-0 rounded-full bg-border" />
          <span className="min-w-0 flex-1 truncate">ほか{rest.length}件</span>
          <span className="tabular shrink-0 font-semibold">{formatYen(restTotal)}</span>
          <span className="tabular w-12 shrink-0 text-right text-xs">
            {shareRate(restTotal, total)}%
          </span>
        </li>
      ) : null}
    </ul>
  );
}

/** 月別推移の棒グラフ（横スクロールしない固定幅） */
export function BarTrend({
  items,
  className,
  /** カテゴリ別に表示するときの棒の色。省略時はテーマの基本色 */
  color,
}: {
  items: { label: string; value: number; highlight?: boolean }[];
  className?: string;
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={cn('flex items-end justify-between gap-1.5', className)}>
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="tabular text-[10px] text-muted">{formatYenCompact(item.value)}</span>
          <div
            className={cn(
              'w-full rounded-t-md transition-all',
              color ? '' : item.highlight ? 'bg-primary' : 'bg-primary/35',
            )}
            style={{
              height: `${Math.max(4, (item.value / max) * 96)}px`,
              backgroundColor: color ?? undefined,
              opacity: color && !item.highlight ? 0.45 : 1,
            }}
            role="img"
            aria-label={`${item.label} ${formatYen(item.value)}`}
          />
          <span className="text-[11px] font-semibold text-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
