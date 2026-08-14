import type { Ymd } from './date';
import type { Yen } from './money';

export type UUID = string;

/** 家計グループの利用モード */
export type HouseholdMode = 'personal' | 'shared';

/** 取引の種別 */
export type TxType = 'expense' | 'income';

/** 支出の区分（家計共有か個人の支出か） */
export type ShareScope = 'shared' | 'personal';

export type CategoryKind = 'expense' | 'income';

export type BudgetScope = 'household' | 'personal';

export type GoalStatus = 'active' | 'paused' | 'done' | 'archived';

export type GoalScope = 'shared' | 'personal';

export type TodoPriority = 'low' | 'normal' | 'high';

export type TodoCategory = 'shopping' | 'payment' | 'procedure' | 'other';

/** コメント / Todo の関連付け先 */
export type LinkType = 'transaction' | 'savings_goal' | 'todo';

export const PAYMENT_METHODS = [
  '現金',
  'クレジットカード',
  'デビットカード',
  '電子マネー',
  'QRコード決済',
  '口座振替',
  '銀行振込',
  'その他',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Household {
  id: UUID;
  name: string;
  mode: HouseholdMode;
  /** 月の開始日（1〜28） */
  monthStartDay: number;
  /** 予算の翌月繰越し（既定は false） */
  carryoverEnabled: boolean;
  ownerId: UUID;
  createdAt: string;
}

export interface Member {
  userId: UUID;
  displayName: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface Profile {
  id: UUID;
  displayName: string;
  /** 入り直すときに使うお名前。表示名を変えても変わらない */
  loginName?: string;
  householdId: UUID | null;
}

export interface Category {
  id: UUID;
  householdId: UUID;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  sortOrder: number;
  isHidden: boolean;
  /** 初期カテゴリかどうか（名称変更は可、完全削除は不可） */
  isSystem: boolean;
}

export interface Budget {
  id: UUID;
  householdId: UUID;
  /** 'YYYY-MM-01' */
  month: Ymd;
  scope: BudgetScope;
  /** scope === 'personal' のときだけ設定される */
  userId: UUID | null;
  /** null なら「全体予算」 */
  categoryId: UUID | null;
  amountYen: Yen;
  createdBy: UUID;
  updatedAt: string;
}

export interface Transaction {
  id: UUID;
  householdId: UUID;
  type: TxType;
  amountYen: Yen;
  categoryId: UUID;
  description: string;
  occurredOn: Ymd;
  paidBy: UUID;
  shareScope: ShareScope;
  paymentMethod: PaymentMethod;
  memo: string;
  savingsGoalId: UUID | null;
  /** レシート画像の保存先（初期版では未使用。将来の拡張用に列だけ用意） */
  receiptPath: string | null;
  createdBy: UUID;
  updatedBy: UUID;
  createdAt: string;
  updatedAt: string;
}

export type TransactionInput = Omit<
  Transaction,
  'id' | 'householdId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

export interface RecurringRule {
  id: UUID;
  householdId: UUID;
  name: string;
  type: TxType;
  amountYen: Yen;
  categoryId: UUID;
  /** 毎月の発生日（1〜28） */
  dayOfMonth: number;
  paidBy: UUID;
  shareScope: ShareScope;
  paymentMethod: PaymentMethod;
  memo: string;
  active: boolean;
  /** 最後に確認済みとして取り込んだ月 'YYYY-MM-01' */
  lastConfirmedMonth: Ymd | null;
  createdBy: UUID;
}

export interface SavingsGoal {
  id: UUID;
  householdId: UUID;
  name: string;
  targetYen: Yen;
  targetDate: Ymd | null;
  color: string;
  icon: string;
  memo: string;
  scope: GoalScope;
  /** scope === 'personal' のときの所有者。共有目標では null */
  ownerId: UUID | null;
  status: GoalStatus;
  createdBy: UUID;
  createdAt: string;
}

export interface SavingsEntry {
  id: UUID;
  goalId: UUID;
  householdId: UUID;
  /** 入金は正、出金は負 */
  amountYen: Yen;
  occurredOn: Ymd;
  userId: UUID;
  memo: string;
  /** 家計簿の支出から自動作成された場合の元取引 */
  transactionId: UUID | null;
  createdAt: string;
}

export interface Comment {
  id: UUID;
  householdId: UUID;
  userId: UUID;
  body: string;
  linkType: LinkType | null;
  linkId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface Todo {
  id: UUID;
  householdId: UUID;
  title: string;
  done: boolean;
  doneAt: string | null;
  /** null かつ assignBoth=false なら担当者なし */
  assigneeUserId: UUID | null;
  assignBoth: boolean;
  dueOn: Ymd | null;
  priority: TodoPriority;
  category: TodoCategory;
  memo: string;
  linkType: LinkType | null;
  linkId: UUID | null;
  createdBy: UUID;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** アプリ全体で共有する読み込み済みデータ */
export interface HouseholdSnapshot {
  household: Household;
  members: Member[];
  me: Profile;
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  savingsGoals: SavingsGoal[];
  savingsEntries: SavingsEntry[];
  comments: Comment[];
  todos: Todo[];
  lastCommentReadAt: string | null;
}

/** ホーム画面などの表示対象フィルタ */
export type ViewerFilter = 'all' | 'me' | 'partner';
