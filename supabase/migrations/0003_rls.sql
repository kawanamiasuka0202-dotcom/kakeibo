-- ============================================================================
-- 0003_rls.sql : Row Level Security
--
-- 基本の考え方
--   * すべてのテーブルで RLS を有効にする。ポリシーが無い操作は「できない」。
--   * 参照できる条件は原則「自分がそのグループのメンバーであること」の一点。
--     -> public.is_household_member(household_id)
--   * 個人の貯金目標（scope='personal'）だけは所有者本人しか見られない。
--   * メンバー追加・合言葉の変更など重要な処理はテーブルへの直接書き込みを許さず、
--     0002_functions.sql の security definer 関数からのみ行う。
-- ============================================================================

alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.budgets             enable row level security;
alter table public.transactions        enable row level security;
alter table public.savings_goals       enable row level security;
alter table public.savings_entries     enable row level security;
alter table public.recurring_rules     enable row level security;
alter table public.todos               enable row level security;
alter table public.comments            enable row level security;
alter table public.comment_reads       enable row level security;

-- 未ログイン(anon)には一切のテーブル権限を渡さない
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.categories,
  public.budgets,
  public.transactions,
  public.savings_goals,
  public.savings_entries,
  public.recurring_rules,
  public.todos,
  public.comments,
  public.comment_reads
to authenticated;
grant select, update on public.households, public.profiles to authenticated;
grant select on public.household_members to authenticated;

-- 合言葉の照合用の値は、ブラウザからは読み書きさせない。
-- （読めてしまうと、それだけで他人が同じ家計に入れてしまうため）
-- 変更は set_passphrase / remove_partner の security definer 関数からのみ行う。
revoke select (passphrase_hash), update (passphrase_hash) on public.households from authenticated;

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- insert / delete のポリシーは作らない（create_household / leave_household 経由のみ）

-- ---------------------------------------------------------------------------
-- household_members : 参照のみ。変更は関数経由。
-- ---------------------------------------------------------------------------
drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- profiles : 自分と、同じグループのメンバーだけ
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated
  with check (public.is_household_member(household_id) and is_system = false);

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- 初期カテゴリは削除できない（非表示にはできる）。
-- 過去データがあるカテゴリは外部キー(on delete restrict)により DB 側でも削除が拒否される。
drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories
  for delete to authenticated
  using (public.is_household_member(household_id) and is_system = false);

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists budgets_insert on public.budgets;
create policy budgets_insert on public.budgets
  for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = auth.uid());

drop policy if exists budgets_update on public.budgets;
create policy budgets_update on public.budgets
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists budgets_delete on public.budgets;
create policy budgets_delete on public.budgets
  for delete to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- transactions
--   夫婦で家計を管理する前提なので、同じグループのメンバーは相手の入力も修正できる。
--   ただし created_by / updated_by を必ず自分にすることで「誰が入力・更新したか」を残す。
-- ---------------------------------------------------------------------------
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and exists (
      select 1 from public.household_members m
      where m.household_id = transactions.household_id and m.user_id = transactions.paid_by
    )
  );

drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and updated_by = auth.uid()
    and exists (
      select 1 from public.household_members m
      where m.household_id = transactions.household_id and m.user_id = transactions.paid_by
    )
  );

drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions
  for delete to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- savings_goals : 個人目標は本人だけ
-- ---------------------------------------------------------------------------
drop policy if exists savings_goals_select on public.savings_goals;
create policy savings_goals_select on public.savings_goals
  for select to authenticated
  using (
    public.is_household_member(household_id)
    and (scope = 'shared' or owner_id = auth.uid())
  );

drop policy if exists savings_goals_insert on public.savings_goals;
create policy savings_goals_insert on public.savings_goals
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
    and (scope = 'shared' or owner_id = auth.uid())
  );

drop policy if exists savings_goals_update on public.savings_goals;
create policy savings_goals_update on public.savings_goals
  for update to authenticated
  using (
    public.is_household_member(household_id)
    and (scope = 'shared' or owner_id = auth.uid())
  )
  with check (
    public.is_household_member(household_id)
    and (scope = 'shared' or owner_id = auth.uid())
  );

drop policy if exists savings_goals_delete on public.savings_goals;
create policy savings_goals_delete on public.savings_goals
  for delete to authenticated
  using (
    public.is_household_member(household_id)
    and (scope = 'shared' or owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- savings_entries : 参照できる目標に紐づくものだけ
--   下の exists は savings_goals の RLS も同時に効くため、他人の個人目標の履歴は見えない。
-- ---------------------------------------------------------------------------
drop policy if exists savings_entries_select on public.savings_entries;
create policy savings_entries_select on public.savings_entries
  for select to authenticated
  using (
    public.is_household_member(household_id)
    and exists (select 1 from public.savings_goals g where g.id = savings_entries.goal_id)
  );

drop policy if exists savings_entries_insert on public.savings_entries;
create policy savings_entries_insert on public.savings_entries
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and user_id = auth.uid()
    and exists (select 1 from public.savings_goals g where g.id = savings_entries.goal_id)
  );

drop policy if exists savings_entries_update on public.savings_entries;
create policy savings_entries_update on public.savings_entries
  for update to authenticated
  using (
    public.is_household_member(household_id)
    and exists (select 1 from public.savings_goals g where g.id = savings_entries.goal_id)
  )
  with check (public.is_household_member(household_id));

drop policy if exists savings_entries_delete on public.savings_entries;
create policy savings_entries_delete on public.savings_entries
  for delete to authenticated
  using (
    public.is_household_member(household_id)
    and exists (select 1 from public.savings_goals g where g.id = savings_entries.goal_id)
  );

-- ---------------------------------------------------------------------------
-- recurring_rules
-- ---------------------------------------------------------------------------
drop policy if exists recurring_rules_select on public.recurring_rules;
create policy recurring_rules_select on public.recurring_rules
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists recurring_rules_insert on public.recurring_rules;
create policy recurring_rules_insert on public.recurring_rules
  for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = auth.uid());

drop policy if exists recurring_rules_update on public.recurring_rules;
create policy recurring_rules_update on public.recurring_rules
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists recurring_rules_delete on public.recurring_rules;
create policy recurring_rules_delete on public.recurring_rules
  for delete to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- todos : 同じグループなら誰でも操作できる
-- ---------------------------------------------------------------------------
drop policy if exists todos_select on public.todos;
create policy todos_select on public.todos
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos
  for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = auth.uid());

drop policy if exists todos_update on public.todos;
create policy todos_update on public.todos
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists todos_delete on public.todos;
create policy todos_delete on public.todos
  for delete to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- comments : 閲覧はグループ全体、編集・削除は投稿者本人のみ
-- ---------------------------------------------------------------------------
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (public.is_household_member(household_id) and user_id = auth.uid());

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (public.is_household_member(household_id) and user_id = auth.uid())
  with check (public.is_household_member(household_id) and user_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (public.is_household_member(household_id) and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- comment_reads : 自分の既読位置のみ
-- ---------------------------------------------------------------------------
drop policy if exists comment_reads_all on public.comment_reads;
create policy comment_reads_all on public.comment_reads
  for all to authenticated
  using (user_id = auth.uid() and public.is_household_member(household_id))
  with check (user_id = auth.uid() and public.is_household_member(household_id));
