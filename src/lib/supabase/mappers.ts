/**
 * Supabase の行（snake_case）とアプリ内の型（camelCase）の相互変換。
 * 変換をこの1ファイルに集約しておくことで、列名の変更に強くする。
 */
import type {
  Budget,
  Category,
  Comment,
  CommentReaction,
  Household,
  Member,
  RecurringRule,
  SavingsEntry,
  SavingsGoal,
  Todo,
  Transaction,
} from '../types';
import type { EntityMap, EntityName } from '../data/backend';

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export const fromHouseholdRow = (r: Row): Household => ({
  id: str(r.id),
  name: str(r.name, 'わが家'),
  mode: r.mode === 'shared' ? 'shared' : 'personal',
  monthStartDay: num(r.month_start_day, 1),
  carryoverEnabled: bool(r.carryover_enabled),
  ownerId: str(r.owner_id),
  createdAt: str(r.created_at),
});

export const fromMemberRow = (r: Row, displayName: string): Member => ({
  userId: str(r.user_id),
  displayName,
  role: r.role === 'owner' ? 'owner' : 'member',
  joinedAt: str(r.joined_at),
});

const fromCategoryRow = (r: Row): Category => ({
  id: str(r.id),
  householdId: str(r.household_id),
  name: str(r.name),
  kind: r.kind === 'income' ? 'income' : 'expense',
  color: str(r.color, '#9aa0a6'),
  icon: str(r.icon, '📦'),
  sortOrder: num(r.sort_order),
  isHidden: bool(r.is_hidden),
  isSystem: bool(r.is_system),
});

const fromBudgetRow = (r: Row): Budget => ({
  id: str(r.id),
  householdId: str(r.household_id),
  month: str(r.month),
  scope:
    r.scope === 'personal' ? 'personal' : r.scope === 'shared' ? 'shared' : 'household',
  userId: nullableStr(r.user_id),
  categoryId: nullableStr(r.category_id),
  amountYen: num(r.amount_yen),
  createdBy: str(r.created_by),
  updatedAt: str(r.updated_at),
});

const fromTransactionRow = (r: Row): Transaction => ({
  id: str(r.id),
  householdId: str(r.household_id),
  type: r.type === 'income' ? 'income' : 'expense',
  amountYen: num(r.amount_yen),
  categoryId: str(r.category_id),
  description: str(r.description),
  occurredOn: str(r.occurred_on),
  // null は「共有（家計から出したお金）」
  paidBy: nullableStr(r.paid_by),
  shareScope: r.share_scope === 'personal' ? 'personal' : 'shared',
  paymentMethod: str(r.payment_method, '現金') as Transaction['paymentMethod'],
  memo: str(r.memo),
  savingsGoalId: nullableStr(r.savings_goal_id),
  receiptPath: nullableStr(r.receipt_path),
  createdBy: str(r.created_by),
  updatedBy: str(r.updated_by),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

const fromRecurringRow = (r: Row): RecurringRule => ({
  id: str(r.id),
  householdId: str(r.household_id),
  name: str(r.name),
  type: r.type === 'income' ? 'income' : 'expense',
  amountYen: num(r.amount_yen),
  categoryId: str(r.category_id),
  dayOfMonth: num(r.day_of_month, 1),
  paidBy: nullableStr(r.paid_by),
  shareScope: r.share_scope === 'personal' ? 'personal' : 'shared',
  paymentMethod: str(r.payment_method, '口座振替') as RecurringRule['paymentMethod'],
  memo: str(r.memo),
  active: bool(r.active, true),
  lastConfirmedMonth: nullableStr(r.last_confirmed_month),
  createdBy: str(r.created_by),
});

const fromGoalRow = (r: Row): SavingsGoal => ({
  id: str(r.id),
  householdId: str(r.household_id),
  name: str(r.name),
  targetYen: num(r.target_yen),
  targetDate: nullableStr(r.target_date),
  color: str(r.color, '#3f9c7a'),
  icon: str(r.icon, '🐖'),
  memo: str(r.memo),
  scope: r.scope === 'personal' ? 'personal' : 'shared',
  ownerId: nullableStr(r.owner_id),
  status: (['active', 'paused', 'done', 'archived'] as const).includes(r.status as never)
    ? (r.status as SavingsGoal['status'])
    : 'active',
  createdBy: str(r.created_by),
  createdAt: str(r.created_at),
});

const fromSavingsEntryRow = (r: Row): SavingsEntry => ({
  id: str(r.id),
  goalId: str(r.goal_id),
  householdId: str(r.household_id),
  amountYen: num(r.amount_yen),
  occurredOn: str(r.occurred_on),
  userId: str(r.user_id),
  memo: str(r.memo),
  transactionId: nullableStr(r.transaction_id),
  createdAt: str(r.created_at),
});

const fromCommentRow = (r: Row): Comment => ({
  id: str(r.id),
  householdId: str(r.household_id),
  userId: str(r.user_id),
  body: str(r.body),
  linkType: (nullableStr(r.link_type) as Comment['linkType']) ?? null,
  linkId: nullableStr(r.link_id),
  parentId: nullableStr(r.parent_id),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export const fromCommentReactionRow = (r: Row): CommentReaction => ({
  commentId: str(r.comment_id),
  userId: str(r.user_id),
  householdId: str(r.household_id),
  createdAt: str(r.created_at),
});

const fromTodoRow = (r: Row): Todo => ({
  id: str(r.id),
  householdId: str(r.household_id),
  title: str(r.title),
  done: bool(r.done),
  doneAt: nullableStr(r.done_at),
  assigneeUserId: nullableStr(r.assignee_user_id),
  assignBoth: bool(r.assign_both),
  dueOn: nullableStr(r.due_on),
  priority: (['low', 'normal', 'high'] as const).includes(r.priority as never)
    ? (r.priority as Todo['priority'])
    : 'normal',
  category: (['shopping', 'payment', 'procedure', 'other'] as const).includes(r.category as never)
    ? (r.category as Todo['category'])
    : 'other',
  memo: str(r.memo),
  linkType: (nullableStr(r.link_type) as Todo['linkType']) ?? null,
  linkId: nullableStr(r.link_id),
  createdBy: str(r.created_by),
  archivedAt: nullableStr(r.archived_at),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export const ROW_TO_ENTITY: { [K in EntityName]: (r: Row) => EntityMap[K] } = {
  categories: fromCategoryRow,
  budgets: fromBudgetRow,
  transactions: fromTransactionRow,
  recurring_rules: fromRecurringRow,
  savings_goals: fromGoalRow,
  savings_entries: fromSavingsEntryRow,
  comments: fromCommentRow,
  todos: fromTodoRow,
};

/** camelCase のキーを snake_case に変換する（id / createdAt / updatedAt は除外）。 */
const SKIP_KEYS = new Set(['id', 'createdAt', 'updatedAt']);

export function toRow(values: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(values)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value === undefined) continue;
    const column = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    row[column] = value;
  }
  return row;
}

/** テーブルごとの並び順 */
export const ORDER_BY: Record<EntityName, { column: string; ascending: boolean }> = {
  categories: { column: 'sort_order', ascending: true },
  budgets: { column: 'month', ascending: false },
  transactions: { column: 'occurred_on', ascending: false },
  recurring_rules: { column: 'day_of_month', ascending: true },
  savings_goals: { column: 'created_at', ascending: true },
  savings_entries: { column: 'occurred_on', ascending: false },
  comments: { column: 'created_at', ascending: false },
  todos: { column: 'created_at', ascending: false },
};
