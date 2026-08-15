import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '@/lib/categories';
import { buildDemoSnapshot } from '@/lib/data/demo-seed';
import { isValidYen } from '@/lib/money';

describe('初期カテゴリ', () => {
  it('要件どおりの支出カテゴリ30件・収入カテゴリ5件を用意している', () => {
    expect(DEFAULT_EXPENSE_CATEGORIES).toHaveLength(30);
    expect(DEFAULT_INCOME_CATEGORIES).toHaveLength(5);
  });

  it('カテゴリ名が重複していない', () => {
    const names = DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('SQL のシード（0002_functions.sql）と名前・順序が一致している', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '0002_functions.sql'),
      'utf8',
    );
    const section = sql.slice(sql.indexOf('seed_default_categories'));
    const sqlNames = [...section.matchAll(/\('([^']+)',\s+'(expense|income)'/g)].map(
      (m) => `${m[2]}:${m[1]}`,
    );
    const tsNames = DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name}`);
    expect(sqlNames).toEqual(tsNames);
  });

  it('色は #RRGGBB 形式', () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('デモデータ', () => {
  const snapshot = buildDemoSnapshot('2026-08-14');

  it('2人の共有グループとして作られる', () => {
    expect(snapshot.household.mode).toBe('shared');
    expect(snapshot.members).toHaveLength(2);
  });

  it('カテゴリが初期カテゴリと同数', () => {
    expect(snapshot.categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('金額はすべて円単位の整数', () => {
    for (const t of snapshot.transactions) {
      expect(isValidYen(t.amountYen)).toBe(true);
      expect(t.amountYen).toBeGreaterThan(0);
    }
    for (const b of snapshot.budgets) expect(isValidYen(b.amountYen)).toBe(true);
    for (const e of snapshot.savingsEntries) expect(isValidYen(e.amountYen)).toBe(true);
  });

  it('未来の日付の取引を作らない', () => {
    for (const t of snapshot.transactions) {
      expect(t.occurredOn <= '2026-08-14').toBe(true);
    }
  });

  it('取引のカテゴリはすべて実在する', () => {
    const ids = new Set(snapshot.categories.map((c) => c.id));
    for (const t of snapshot.transactions) expect(ids.has(t.categoryId)).toBe(true);
  });

  it('個人目標が1件含まれる（権限の確認用）', () => {
    expect(snapshot.savingsGoals.filter((g) => g.scope === 'personal')).toHaveLength(1);
  });

  it('コメントとTodoのサンプルがある', () => {
    expect(snapshot.comments.length).toBeGreaterThan(0);
    expect(snapshot.todos.length).toBeGreaterThan(0);
  });

  it('共有の支出には支払った人を持たせない（個人に加算しないため）', () => {
    const shared = snapshot.transactions.filter((t) => t.shareScope === 'shared');
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((t) => t.paidBy === null)).toBe(true);
  });

  it('個人の支出には支払った人がいる', () => {
    const personal = snapshot.transactions.filter((t) => t.shareScope === 'personal');
    expect(personal.length).toBeGreaterThan(0);
    expect(personal.every((t) => t.paidBy !== null)).toBe(true);
  });

  it('コメントの返信といいねのサンプルがある', () => {
    expect(snapshot.comments.some((c) => c.parentId !== null)).toBe(true);
    expect(snapshot.commentReactions.length).toBeGreaterThan(0);
  });

  it('返信先といいね先のコメントは実在する', () => {
    const ids = new Set(snapshot.comments.map((c) => c.id));
    for (const c of snapshot.comments) {
      if (c.parentId) expect(ids.has(c.parentId)).toBe(true);
    }
    for (const r of snapshot.commentReactions) expect(ids.has(r.commentId)).toBe(true);
  });

  it('同じ日付を渡せば同じ内容になる（再現性）', () => {
    const again = buildDemoSnapshot('2026-08-14');
    expect(again.transactions.length).toBe(snapshot.transactions.length);
    expect(again.transactions[0].amountYen).toBe(snapshot.transactions[0].amountYen);
  });
});
