import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ORDER_BY, ROW_TO_ENTITY, fromHouseholdRow, toRow } from '../supabase/mappers';
import type { Household, HouseholdSnapshot, Member, UUID } from '../types';
import {
  BackendError,
  type Backend,
  type EntityMap,
  type EntityName,
  type NewEntity,
} from './backend';

const REALTIME_TABLES: EntityName[] = [
  'transactions',
  'budgets',
  'categories',
  'savings_goals',
  'savings_entries',
  'comments',
  'todos',
];

function wrapError(error: { message: string; code?: string } | null, fallback: string): never {
  const message = error?.message ?? fallback;
  if (message.includes('LAST_MEMBER')) {
    throw new BackendError(message, 'last_member');
  }
  if (message.includes('PASSPHRASE_FULL')) {
    throw new BackendError(
      'この合言葉の家計にはすでに2人が参加しています。合言葉が合っているかご確認ください。',
      'passphrase_full',
    );
  }
  if (message.includes('PASSPHRASE_TAKEN')) {
    throw new BackendError('その合言葉はすでに使われています。別の合言葉にしてください。', 'passphrase_taken');
  }
  throw new BackendError(message, error?.code ?? 'unknown');
}

/**
 * Supabase を保存先とする実装。
 * 変更の反映は Realtime の通知を受けて画面側が再読み込みする方式にしている。
 * 差分を細かく当てるより単純で、取り違えが起きない（1世帯のデータ量は多くても数千件のため実用上問題ない）。
 */
export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;

  private householdId: UUID | null = null;
  private userId: UUID | null = null;
  private channel: RealtimeChannel | null = null;

  constructor(private readonly supabase: SupabaseClient) {}

  private async requireUser(): Promise<UUID> {
    if (this.userId) return this.userId;
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) throw new BackendError('ログインが必要です', 'unauthenticated');
    this.userId = data.user.id;
    return this.userId;
  }

  private requireHousehold(): UUID {
    if (!this.householdId) throw new BackendError('家計グループが読み込まれていません', 'no_household');
    return this.householdId;
  }

  async load(): Promise<HouseholdSnapshot | null> {
    const userId = await this.requireUser();

    const { data: memberRow, error: memberError } = await this.supabase
      .from('household_members')
      .select('household_id, role, joined_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (memberError) wrapError(memberError, 'メンバー情報の取得に失敗しました');
    if (!memberRow) return null;

    const householdId = memberRow.household_id as string;
    this.householdId = householdId;

    const [householdRes, membersRes, profilesRes, readRes] = await Promise.all([
      // passphrase_hash はブラウザから読めないようにしてあるため、列を明示して取得する
      this.supabase
        .from('households')
        .select('id, name, mode, month_start_day, carryover_enabled, owner_id, created_at, updated_at')
        .eq('id', householdId)
        .single(),
      this.supabase.from('household_members').select('*').eq('household_id', householdId),
      this.supabase
        .from('profiles')
        .select('id, display_name, login_name, household_id')
        .eq('household_id', householdId),
      this.supabase
        .from('comment_reads')
        .select('last_read_at')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (householdRes.error) wrapError(householdRes.error, '家計グループの取得に失敗しました');
    const household: Household = fromHouseholdRow(householdRes.data as Record<string, unknown>);

    const nameById = new Map<string, string>();
    let myLoginName = '';
    for (const p of (profilesRes.data ?? []) as {
      id: string;
      display_name: string;
      login_name?: string;
    }[]) {
      nameById.set(p.id, p.display_name || 'メンバー');
      if (p.id === userId) myLoginName = p.login_name ?? '';
    }

    const members: Member[] = ((membersRes.data ?? []) as Record<string, unknown>[])
      .map((r) => ({
        userId: String(r.user_id),
        displayName: nameById.get(String(r.user_id)) ?? 'メンバー',
        role: r.role === 'owner' ? ('owner' as const) : ('member' as const),
        joinedAt: String(r.joined_at),
      }))
      .sort((a, b) => (a.userId === userId ? -1 : b.userId === userId ? 1 : 0));

    const entities = await Promise.all(
      (Object.keys(ROW_TO_ENTITY) as EntityName[]).map(async (entity) => {
        const order = ORDER_BY[entity];
        const query = this.supabase
          .from(entity)
          .select('*')
          .eq('household_id', householdId)
          .order(order.column, { ascending: order.ascending });
        const { data, error } = await query;
        if (error) wrapError(error, `${entity} の取得に失敗しました`);
        return [entity, (data ?? []).map((r) => ROW_TO_ENTITY[entity](r as Record<string, unknown>))] as const;
      }),
    );
    const byEntity = Object.fromEntries(entities) as {
      [K in EntityName]: EntityMap[K][];
    };

    return {
      household,
      members,
      me: {
        id: userId,
        displayName: nameById.get(userId) ?? 'わたし',
        loginName: myLoginName,
        householdId,
      },
      categories: byEntity.categories,
      budgets: byEntity.budgets,
      transactions: byEntity.transactions,
      recurringRules: byEntity.recurring_rules,
      savingsGoals: byEntity.savings_goals,
      savingsEntries: byEntity.savings_entries,
      comments: byEntity.comments,
      todos: byEntity.todos,
      lastCommentReadAt: (readRes.data?.last_read_at as string | undefined) ?? null,
    };
  }

  subscribe(onChange: () => void): () => void {
    const householdId = this.householdId;
    if (!householdId) return () => {};

    const channel = this.supabase.channel(`household:${householdId}`);
    for (const table of REALTIME_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => onChange(),
      );
    }
    channel.subscribe();
    this.channel = channel;

    return () => {
      this.supabase.removeChannel(channel);
      if (this.channel === channel) this.channel = null;
    };
  }

  async joinOrCreateHousehold(params: {
    passphraseHash: string;
    displayName: string;
    loginName: string;
    householdName?: string;
  }): Promise<void> {
    await this.requireUser();
    const { data, error } = await this.supabase.rpc('join_or_create_household', {
      p_passphrase_hash: params.passphraseHash,
      p_display_name: params.displayName,
      p_login_name: params.loginName,
      p_household_name: params.householdName ?? 'わが家',
    });
    if (error) wrapError(error, '家計グループへの参加に失敗しました');
    this.householdId = data as string;
  }

  async setPassphrase(passphraseHash: string): Promise<void> {
    const { error } = await this.supabase.rpc('set_passphrase', { p_new_hash: passphraseHash });
    if (error) wrapError(error, '合言葉の変更に失敗しました');
  }

  async updateHousehold(patch: Partial<Household>): Promise<void> {
    const householdId = this.requireHousehold();
    const { error } = await this.supabase.from('households').update(toRow(patch)).eq('id', householdId);
    if (error) wrapError(error, '設定の保存に失敗しました');
  }

  async updateProfile(patch: { displayName: string }): Promise<void> {
    const userId = await this.requireUser();
    const { error } = await this.supabase
      .from('profiles')
      .update({ display_name: patch.displayName })
      .eq('id', userId);
    if (error) wrapError(error, '表示名の保存に失敗しました');
  }

  async create<K extends EntityName>(entity: K, values: NewEntity<K>): Promise<EntityMap[K]> {
    const householdId = this.requireHousehold();
    const row = { ...toRow(values as Record<string, unknown>), household_id: householdId };
    const { data, error } = await this.supabase.from(entity).insert(row).select().single();
    if (error) wrapError(error, '保存に失敗しました');
    return ROW_TO_ENTITY[entity](data as Record<string, unknown>);
  }

  async update<K extends EntityName>(entity: K, id: UUID, patch: Partial<EntityMap[K]>): Promise<void> {
    const { error } = await this.supabase
      .from(entity)
      .update(toRow(patch as Record<string, unknown>))
      .eq('id', id);
    if (error) wrapError(error, '更新に失敗しました');
  }

  async remove<K extends EntityName>(entity: K, id: UUID): Promise<void> {
    const { error } = await this.supabase.from(entity).delete().eq('id', id);
    if (error) wrapError(error, '削除に失敗しました');
  }

  async copyBudgetsFromPreviousMonth(month: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('copy_budgets_from_previous_month', {
      p_month: month,
    });
    if (error) wrapError(error, '前月の予算のコピーに失敗しました');
    return Number(data ?? 0);
  }

  async markCommentsRead(at: string): Promise<void> {
    const householdId = this.requireHousehold();
    const userId = await this.requireUser();
    const { error } = await this.supabase
      .from('comment_reads')
      .upsert({ household_id: householdId, user_id: userId, last_read_at: at });
    if (error) wrapError(error, '既読の保存に失敗しました');
  }

  async removePartner(userId: UUID, newPassphraseHash: string): Promise<void> {
    const { error } = await this.supabase.rpc('remove_partner', {
      p_user_id: userId,
      p_new_passphrase_hash: newPassphraseHash,
    });
    if (error) wrapError(error, 'パートナーの解除に失敗しました');
  }

  async leaveHousehold(deleteData: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('leave_household', { p_delete_data: deleteData });
    if (error) wrapError(error, '退出に失敗しました');
    this.householdId = null;
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.supabase.rpc('delete_my_account');
    if (error) wrapError(error, 'アカウントの削除に失敗しました');
    await this.supabase.auth.signOut();
  }
}
