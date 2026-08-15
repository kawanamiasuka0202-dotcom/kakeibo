import { newId, nowIso } from '../utils';
import type { Household, HouseholdSnapshot, UUID } from '../types';
import {
  BackendError,
  type Backend,
  type EntityMap,
  type EntityName,
  type NewEntity,
} from './backend';
import { buildDemoSnapshot, DEMO_HOUSEHOLD_ID, DEMO_ME_ID } from './demo-seed';

const STORAGE_KEY = 'kakeibo:demo:v1';
const CHANGE_EVENT = 'kakeibo:demo:change';

/**
 * デモモードのデータ保存先。
 * ブラウザの localStorage にサンプルデータを持ち、Supabase なしで全機能を試せるようにする。
 * リアルタイム更新は同一ブラウザ内のイベント + 他タブの storage イベントで再現する。
 */
export class DemoBackend implements Backend {
  readonly kind = 'demo' as const;

  private read(): HouseholdSnapshot {
    if (typeof window === 'undefined') return buildDemoSnapshot();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = buildDemoSnapshot();
      this.write(fresh, false);
      return fresh;
    }
    try {
      const parsed = JSON.parse(raw) as HouseholdSnapshot;
      // 古い形式で保存されている場合に備えて、後から足した項目を補う
      parsed.commentReactions ??= [];
      return parsed;
    } catch {
      const fresh = buildDemoSnapshot();
      this.write(fresh, false);
      return fresh;
    }
  }

  private write(snapshot: HouseholdSnapshot, notify = true): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    if (notify) window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  private mutate(fn: (snapshot: HouseholdSnapshot) => void): void {
    const snapshot = this.read();
    fn(snapshot);
    this.write(snapshot);
  }

  /** デモデータを初期状態に戻す。 */
  static reset(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  async load(): Promise<HouseholdSnapshot | null> {
    return this.read();
  }

  subscribe(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = () => onChange();
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) onChange();
    };
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }

  async joinOrCreateHousehold(): Promise<void> {
    // デモモードでは常にサンプルの家計グループが存在する
  }

  async updateHousehold(patch: Partial<Household>): Promise<void> {
    this.mutate((s) => {
      s.household = { ...s.household, ...patch };
    });
  }

  async updateProfile(patch: { displayName: string }): Promise<void> {
    this.mutate((s) => {
      s.me = { ...s.me, displayName: patch.displayName };
      const m = s.members.find((x) => x.userId === s.me.id);
      if (m) m.displayName = patch.displayName;
    });
  }

  private listOf(s: HouseholdSnapshot, entity: EntityName): Record<string, unknown>[] {
    const map: Record<EntityName, unknown> = {
      categories: s.categories,
      budgets: s.budgets,
      transactions: s.transactions,
      recurring_rules: s.recurringRules,
      savings_goals: s.savingsGoals,
      savings_entries: s.savingsEntries,
      comments: s.comments,
      todos: s.todos,
    };
    return map[entity] as Record<string, unknown>[];
  }

  async create<K extends EntityName>(entity: K, values: NewEntity<K>): Promise<EntityMap[K]> {
    const created = {
      ...(values as object),
      id: newId(),
      householdId: DEMO_HOUSEHOLD_ID,
      createdAt: (values as { createdAt?: string }).createdAt ?? nowIso(),
      updatedAt: nowIso(),
    } as EntityMap[K];
    this.mutate((s) => {
      this.listOf(s, entity).unshift(created as unknown as Record<string, unknown>);
    });
    return created;
  }

  async update<K extends EntityName>(entity: K, id: UUID, patch: Partial<EntityMap[K]>): Promise<void> {
    this.mutate((s) => {
      const list = this.listOf(s, entity);
      const index = list.findIndex((row) => row.id === id);
      if (index === -1) throw new BackendError('対象のデータが見つかりません', 'not_found');
      list[index] = { ...list[index], ...(patch as object), updatedAt: nowIso() };
    });
  }

  async remove<K extends EntityName>(entity: K, id: UUID): Promise<void> {
    this.mutate((s) => {
      const list = this.listOf(s, entity);
      const index = list.findIndex((row) => row.id === id);
      if (index !== -1) list.splice(index, 1);
      if (entity === 'savings_goals') {
        s.savingsEntries = s.savingsEntries.filter((e) => e.goalId !== id);
      }
      if (entity === 'comments') {
        // 返信といいねも一緒に消す（DB の on delete cascade と同じ動き）
        s.comments = s.comments.filter((c) => c.parentId !== id);
        s.commentReactions = (s.commentReactions ?? []).filter((r) => r.commentId !== id);
      }
    });
  }

  async copyBudgetsFromPreviousMonth(month: string): Promise<number> {
    let copied = 0;
    this.mutate((s) => {
      const [y, m] = month.split('-').map(Number);
      const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
      const source = s.budgets.filter((b) => b.month === prev);
      for (const b of source) {
        const exists = s.budgets.some(
          (x) =>
            x.month === month &&
            x.scope === b.scope &&
            x.userId === b.userId &&
            x.categoryId === b.categoryId,
        );
        if (exists) continue;
        s.budgets.push({ ...b, id: newId(), month, updatedAt: nowIso() });
        copied += 1;
      }
    });
    return copied;
  }

  async markCommentsRead(at: string): Promise<void> {
    this.mutate((s) => {
      s.lastCommentReadAt = at;
    });
  }

  async setCommentReaction(commentId: UUID, liked: boolean): Promise<void> {
    this.mutate((s) => {
      const list = s.commentReactions ?? [];
      const rest = list.filter((r) => !(r.commentId === commentId && r.userId === s.me.id));
      s.commentReactions = liked
        ? [
            ...rest,
            {
              commentId,
              userId: s.me.id,
              householdId: s.household.id,
              createdAt: nowIso(),
            },
          ]
        : rest;
    });
  }

  async setPassphrase(): Promise<void> {
    throw new BackendError('デモモードでは合言葉を変更できません', 'demo');
  }

  async removePartner(): Promise<void> {
    this.mutate((s) => {
      s.members = s.members.filter((m) => m.userId === DEMO_ME_ID);
      s.household.mode = 'personal';
    });
  }

  async leaveHousehold(): Promise<void> {
    DemoBackend.reset();
  }

  async deleteAccount(): Promise<void> {
    DemoBackend.reset();
  }
}
