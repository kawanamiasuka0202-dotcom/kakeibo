-- ============================================================================
-- 0005_shared_payer_and_comment_reactions.sql
--
-- すでに 0001〜0004 を実行したデータベースに、あとから加えた変更をあてるためのファイル。
-- これから新しく作る場合は 0001〜0004 に同じ内容が入っているため、実行しても何も変わらない。
--
--  1. 「共有」の支出を、特定の個人の支払いとして集計しないようにする
--     （transactions.paid_by / recurring_rules.paid_by を NULL 可にする）
--  2. コメントに「返信」と「いいね」を追加する
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 共有の支出は「誰の支払いでもない」状態を持てるようにする
-- ---------------------------------------------------------------------------
alter table public.transactions    alter column paid_by drop not null;
alter table public.recurring_rules alter column paid_by drop not null;

-- すでに登録済みの「共有の支出」は、個人の支払いから外す。
-- （これをしないと、入力した人ひとりに共有支出が積み上がって見えてしまう）
-- 収入は「誰の収入か」を残すため、そのままにする。
update public.transactions
set paid_by = null
where share_scope = 'shared' and type = 'expense' and paid_by is not null;

update public.recurring_rules
set paid_by = null
where share_scope = 'shared' and paid_by is not null;

-- 登録・更新の許可条件も、paid_by が空の場合を通すようにそろえる。
-- （これがないと共有の支出を保存するときに
--   「new row violates row-level security policy」になる）
drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and (
      transactions.paid_by is null
      or exists (
        select 1 from public.household_members m
        where m.household_id = transactions.household_id and m.user_id = transactions.paid_by
      )
    )
  );

drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and updated_by = auth.uid()
    and (
      transactions.paid_by is null
      or exists (
        select 1 from public.household_members m
        where m.household_id = transactions.household_id and m.user_id = transactions.paid_by
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2-1. コメントの返信
-- ---------------------------------------------------------------------------
alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade;

create index if not exists comments_parent_idx on public.comments (parent_id);

-- ---------------------------------------------------------------------------
-- 2-2. コメントの「いいね」
-- ---------------------------------------------------------------------------
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_reactions_household_idx on public.comment_reactions (household_id);

alter table public.comment_reactions enable row level security;

revoke all on public.comment_reactions from anon;
grant select, insert, update, delete on public.comment_reactions to authenticated;

drop policy if exists comment_reactions_select on public.comment_reactions;
create policy comment_reactions_select on public.comment_reactions
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists comment_reactions_insert on public.comment_reactions;
create policy comment_reactions_insert on public.comment_reactions
  for insert to authenticated
  with check (public.is_household_member(household_id) and user_id = auth.uid());

drop policy if exists comment_reactions_delete on public.comment_reactions;
create policy comment_reactions_delete on public.comment_reactions
  for delete to authenticated
  using (public.is_household_member(household_id) and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2-3. いいねもリアルタイムに反映する
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comment_reactions'
  ) then
    alter publication supabase_realtime add table public.comment_reactions;
  end if;
end;
$$;

alter table public.comment_reactions replica identity full;
