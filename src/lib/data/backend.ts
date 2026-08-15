import type {
  Budget,
  Category,
  Comment,
  Household,
  HouseholdSnapshot,
  RecurringRule,
  SavingsEntry,
  SavingsGoal,
  Todo,
  Transaction,
  UUID,
} from '../types';

/**
 * データ保存先の抽象化。
 * 実装は 2 つ:
 *   - SupabaseBackend : 本番。Postgres + RLS + Realtime
 *   - DemoBackend     : デモモード。ブラウザの localStorage にサンプルデータを保持
 * 画面側はこのインターフェースだけを見るので、両モードで同じ UI コードが動く。
 */

export interface EntityMap {
  categories: Category;
  budgets: Budget;
  transactions: Transaction;
  recurring_rules: RecurringRule;
  savings_goals: SavingsGoal;
  savings_entries: SavingsEntry;
  comments: Comment;
  todos: Todo;
}

export type EntityName = keyof EntityMap;

/** 新規作成時に画面側が渡す値（id と日時は保存先が付与する） */
export type NewEntity<K extends EntityName> = Omit<
  EntityMap[K],
  'id' | 'createdAt' | 'updatedAt'
> & { createdAt?: string; updatedAt?: string };

export class BackendError extends Error {
  readonly code: string;
  constructor(message: string, code = 'unknown') {
    super(message);
    this.name = 'BackendError';
    this.code = code;
  }
}

export interface Backend {
  readonly kind: 'demo' | 'supabase';

  /** 家計グループのデータを一式読み込む。まだグループが無い場合は null。 */
  load(): Promise<HouseholdSnapshot | null>;

  /** 変更を購読する。戻り値は解除関数。 */
  subscribe(onChange: () => void): () => void;

  /**
   * 合言葉で家計グループに入る（同じ合言葉のグループが無ければ作る）。
   * passphraseHash は合言葉そのものではなく、端末側で計算した照合用の値。
   */
  joinOrCreateHousehold(params: {
    passphraseHash: string;
    displayName: string;
    loginName: string;
    householdName?: string;
  }): Promise<void>;
  updateHousehold(patch: Partial<Pick<Household, 'name' | 'mode' | 'monthStartDay' | 'carryoverEnabled'>>): Promise<void>;
  updateProfile(patch: { displayName: string }): Promise<void>;
  /** 合言葉を変更する（1人で使っているときだけ） */
  setPassphrase(passphraseHash: string): Promise<void>;

  create<K extends EntityName>(entity: K, values: NewEntity<K>): Promise<EntityMap[K]>;
  update<K extends EntityName>(entity: K, id: UUID, patch: Partial<EntityMap[K]>): Promise<void>;
  remove<K extends EntityName>(entity: K, id: UUID): Promise<void>;

  /** 前月の予算をコピーする。戻り値はコピーした件数。 */
  copyBudgetsFromPreviousMonth(month: string): Promise<number>;

  markCommentsRead(at: string): Promise<void>;

  /** コメントへの「いいね」を付ける／外す */
  setCommentReaction(commentId: UUID, liked: boolean): Promise<void>;

  /**
   * パートナーを解除する。
   * 解除しただけでは相手が同じ合言葉で入り直せてしまうため、新しい合言葉が必須。
   */
  removePartner(userId: UUID, newPassphraseHash: string): Promise<void>;
  leaveHousehold(deleteData: boolean): Promise<void>;
  deleteAccount(): Promise<void>;
}

export type { Budget, Category, Comment, RecurringRule, SavingsEntry, SavingsGoal, Todo, Transaction };
