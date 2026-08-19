-- ============================================================================
-- 0001_schema.sql : テーブル定義
--
-- 設計方針
--  * 金額はすべて bigint の「円単位の整数」。numeric / float は使わない。
--  * 日付は date 型（日本時間で決めた YYYY-MM-DD をそのまま保存）。日時は timestamptz。
--  * 個人モードでも必ず households を1件作る。メンバーが1人か2人かの違いだけにすることで、
--    アクセス制御を「household_members に自分がいるか」の一点に統一できる。
-- ============================================================================

create extension if not exists pgcrypto;

-- 更新日時を自動で更新する共通トリガー関数
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 家計グループ
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'わが家' check (char_length(name) between 1 and 50),
  mode text not null default 'personal' check (mode in ('personal', 'shared')),
  month_start_day smallint not null default 1 check (month_start_day between 1 and 28),
  carryover_enabled boolean not null default false,
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- 合言葉そのものは保存しない。合言葉から作った照合用の値だけを持つ。
  -- 2人はこの値が一致することで同じ家計グループに入る。
  passphrase_hash text not null unique check (passphrase_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- メンバー（1グループ原則2人まで）
-- ---------------------------------------------------------------------------
create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx on public.household_members (user_id);

-- 3人目の追加を DB 側で拒否する（クライアントの検証だけに頼らない）
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
as $$
declare
  member_count integer;
begin
  select count(*) into member_count
  from public.household_members
  where household_id = new.household_id;

  if member_count >= 2 then
    raise exception '1つの家計グループに参加できるのは2人までです'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger household_members_limit
  before insert on public.household_members
  for each row execute function public.enforce_member_limit();

-- ---------------------------------------------------------------------------
-- プロフィール
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 20),
  -- 入り直すときに使うお名前。表示名を変えてもログインに影響しないよう別に持つ。
  login_name text not null default '' check (char_length(login_name) <= 40),
  household_id uuid references public.households (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- サインアップ時にプロフィールを自動作成する。
-- メールアドレスは合言葉から自動生成した内部用の値なので、表示名には使わない。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', 'わたし'), 20))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 招待コードは廃止し、合言葉（households.passphrase_hash）に統一した。
-- 以前の版から更新する場合のために、残っていれば削除する。
drop table if exists public.invites cascade;

-- ---------------------------------------------------------------------------
-- カテゴリ
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  kind text not null check (kind in ('expense', 'income')),
  color text not null default '#9aa0a6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default '📦' check (char_length(icon) <= 4),
  sort_order integer not null default 0,
  is_hidden boolean not null default false,
  -- 初期カテゴリ。名称変更・非表示は可能だが、完全削除はできない
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, kind, name)
);

create index if not exists categories_household_idx on public.categories (household_id, kind, sort_order);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 予算
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- 月の1日を月キーとして使う（実際の集計期間は households.month_start_day で決まる）
  month date not null,
  -- household = 家計全体（共有＋個人のすべて）
  -- shared    = 共有だけ（家計から出したお金）
  -- personal  = その人の個人支出
  scope text not null check (scope in ('household', 'shared', 'personal')),
  user_id uuid references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  amount_yen bigint not null check (amount_yen >= 0 and amount_yen <= 1000000000000),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_is_first_day check (extract(day from month) = 1),
  constraint budgets_scope_user check (
    (scope in ('household', 'shared') and user_id is null)
    or (scope = 'personal' and user_id is not null)
  )
);

-- 同じ月・同じ対象の予算が二重に作られないようにする（NULL を含む一意制約のため coalesce を使う）
create unique index if not exists budgets_unique_idx on public.budgets (
  household_id,
  month,
  scope,
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 貯金目標（transactions より先に作る。transactions から参照するため）
-- ---------------------------------------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  target_yen bigint not null check (target_yen > 0 and target_yen <= 1000000000000),
  target_date date,
  color text not null default '#3f9c7a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default '🐖' check (char_length(icon) <= 4),
  memo text not null default '' check (char_length(memo) <= 500),
  scope text not null default 'shared' check (scope in ('shared', 'personal')),
  -- 個人目標の所有者。共有目標では null
  owner_id uuid references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'archived')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_scope_owner check (
    (scope = 'shared' and owner_id is null) or (scope = 'personal' and owner_id is not null)
  )
);

create index if not exists savings_goals_household_idx on public.savings_goals (household_id, status);

create trigger savings_goals_set_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 取引（支出・収入）
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  -- 金額は必ず1円以上の整数。0円以下は登録できない
  amount_yen bigint not null check (amount_yen > 0 and amount_yen <= 1000000000000),
  category_id uuid not null references public.categories (id) on delete restrict,
  description text not null default '' check (char_length(description) <= 100),
  occurred_on date not null,
  -- NULL は「共有（家計から出した）」を表す。特定の個人の支出として集計しない。
  paid_by uuid references auth.users (id) on delete cascade,
  share_scope text not null default 'shared' check (share_scope in ('shared', 'personal')),
  payment_method text not null default '現金' check (char_length(payment_method) <= 20),
  memo text not null default '' check (char_length(memo) <= 500),
  savings_goal_id uuid references public.savings_goals (id) on delete set null,
  -- レシート画像（初期版では未使用。将来 Supabase Storage のパスを入れる）
  receipt_path text,
  created_by uuid not null references auth.users (id) on delete cascade,
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_household_date_idx
  on public.transactions (household_id, occurred_on desc);
create index if not exists transactions_category_idx on public.transactions (category_id);
create index if not exists transactions_goal_idx on public.transactions (savings_goal_id);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 貯金の入出金履歴
-- ---------------------------------------------------------------------------
create table if not exists public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  -- 入金は正、出金は負。0 は不可
  amount_yen bigint not null check (amount_yen <> 0 and abs(amount_yen) <= 1000000000000),
  occurred_on date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  memo text not null default '' check (char_length(memo) <= 200),
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists savings_entries_goal_idx on public.savings_entries (goal_id, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 定期支出
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  type text not null default 'expense' check (type in ('expense', 'income')),
  amount_yen bigint not null check (amount_yen > 0 and amount_yen <= 1000000000000),
  category_id uuid not null references public.categories (id) on delete restrict,
  day_of_month smallint not null default 1 check (day_of_month between 1 and 28),
  -- NULL は「共有（家計から出した）」を表す。特定の個人の支出として集計しない。
  paid_by uuid references auth.users (id) on delete cascade,
  share_scope text not null default 'shared' check (share_scope in ('shared', 'personal')),
  payment_method text not null default '口座振替' check (char_length(payment_method) <= 20),
  memo text not null default '' check (char_length(memo) <= 500),
  active boolean not null default true,
  -- 確認済みとして取り込んだ月。自動では確定させない
  last_confirmed_month date,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_rules_household_idx on public.recurring_rules (household_id, active);

create trigger recurring_rules_set_updated_at
  before update on public.recurring_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Todo
-- ---------------------------------------------------------------------------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  done boolean not null default false,
  done_at timestamptz,
  assignee_user_id uuid references auth.users (id) on delete set null,
  assign_both boolean not null default false,
  due_on date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  category text not null default 'other' check (category in ('shopping', 'payment', 'procedure', 'other')),
  memo text not null default '' check (char_length(memo) <= 500),
  link_type text check (link_type in ('transaction', 'savings_goal', 'todo')),
  link_id uuid,
  created_by uuid not null references auth.users (id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todos_household_idx on public.todos (household_id, done, due_on);

create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- コメント
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  link_type text check (link_type in ('transaction', 'savings_goal', 'todo')),
  link_id uuid,
  -- 返信のとき、返信先のコメント。元のコメントを消すと返信も消える。
  parent_id uuid references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_household_idx on public.comments (household_id, created_at desc);
create index if not exists comments_parent_idx on public.comments (parent_id);

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- コメントへの「いいね」。1人1コメントにつき1件。
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_reactions_household_idx on public.comment_reactions (household_id);

-- 未読件数のための既読位置
create table if not exists public.comment_reads (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
