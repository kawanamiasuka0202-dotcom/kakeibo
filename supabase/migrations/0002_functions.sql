-- ============================================================================
-- 0002_functions.sql : サーバー側で実行する処理
--
-- 「セキュリティ上重要な処理をクライアント側だけで完結させない」ため、
-- 家計グループの作成・招待の受諾・パートナー解除などはすべてここの関数で行う。
-- いずれも security definer だが、内部で auth.uid() を必ず確認している。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RLS から使う判定関数
-- security definer にすることで、ポリシー評価中の再帰参照を避ける。
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 初期カテゴリの投入
-- src/lib/categories.ts と同じ内容・同じ並び順にすること
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_categories(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (household_id, name, kind, color, icon, sort_order, is_system)
  select p_household_id, v.name, v.kind, v.color, v.icon, v.sort_order, true
  from (values
    ('食費',                 'expense', '#e2725b', '🍚',  10),
    ('外食費',               'expense', '#d9694f', '🍜',  20),
    ('日用品',               'expense', '#c98a5b', '🧻',  30),
    ('住居費',               'expense', '#7c6f9c', '🏠',  40),
    ('水道',                 'expense', '#4f9ec4', '🚰',  50),
    ('電気',                 'expense', '#e0a83c', '💡',  60),
    ('ガス',                 'expense', '#cf7b3c', '🔥',  70),
    ('通信費',               'expense', '#5a8fbf', '📱',  80),
    ('サブスクリプション',   'expense', '#8a7fc4', '🔁',  90),
    ('交通費',               'expense', '#4e9c86', '🚃', 100),
    ('自動車',               'expense', '#5f7f9c', '🚗', 110),
    ('医療費',               'expense', '#4fa39c', '🏥', 120),
    ('保険',                 'expense', '#6c8fa3', '🛡️', 130),
    ('美容',                 'expense', '#c97b9c', '💇', 140),
    ('衣服',                 'expense', '#b06f8c', '👕', 150),
    ('趣味',                 'expense', '#9c7bc4', '🎸', 160),
    ('娯楽',                 'expense', '#7f8fd6', '🎬', 170),
    ('旅行',                 'expense', '#3f9ec4', '✈️', 180),
    ('交際費',               'expense', '#c98a3c', '🍻', 190),
    ('プレゼント',           'expense', '#d6708c', '🎁', 200),
    ('教育',                 'expense', '#5f9c5f', '📚', 210),
    ('子ども',               'expense', '#e09a5f', '🧸', 220),
    ('ペット',               'expense', '#a3874f', '🐾', 230),
    ('税金',                 'expense', '#8c8c8c', '🧾', 240),
    ('家具・家電',           'expense', '#7a8fa3', '🛋️', 250),
    ('特別支出',             'expense', '#a35f7a', '⭐', 260),
    ('お小遣い',             'expense', '#9c9c5f', '👛', 270),
    ('貯金',                 'expense', '#3f9c7a', '🐖', 280),
    ('投資',                 'expense', '#4f7fa3', '📈', 290),
    ('その他',               'expense', '#9aa0a6', '📦', 300),
    ('給与',                 'income',  '#3f9c7a', '💴', 310),
    ('賞与',                 'income',  '#4fa39c', '🎉', 320),
    ('副業',                 'income',  '#5f9c5f', '💼', 330),
    ('臨時収入',             'income',  '#7fa35f', '✨', 340),
    ('その他収入',           'income',  '#9aa0a6', '📥', 350)
  ) as v(name, kind, color, icon, sort_order)
  on conflict (household_id, kind, name) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 合言葉で家計グループに入る（なければ作る）
--
--   p_passphrase_hash は合言葉そのものではなく、端末側で作った照合用の値。
--   同じ合言葉を入れた2人が、同じ家計グループに入ることになる。
--   3人目は入れない（DB のトリガーでも二重に防いでいる）。
-- ---------------------------------------------------------------------------
create or replace function public.join_or_create_household(
  p_passphrase_hash text,
  p_display_name text,
  p_login_name text,
  p_household_name text default 'わが家'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_current_id uuid;
  v_current_hash text;
  v_member_count integer;
  v_display text := left(coalesce(nullif(trim(p_display_name), ''), 'わたし'), 20);
  v_login text := left(coalesce(nullif(trim(p_login_name), ''), v_display), 40);
begin
  if v_user_id is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;

  if p_passphrase_hash !~ '^[0-9a-f]{64}$' then
    raise exception '合言葉の形式が不正です' using errcode = '22023';
  end if;

  -- すでにどこかの家計グループに入っている場合
  select m.household_id, h.passphrase_hash into v_current_id, v_current_hash
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = v_user_id
  limit 1;

  if v_current_id is not null then
    if v_current_hash is distinct from p_passphrase_hash then
      raise exception '別の家計グループに参加しています。先に退出してください' using errcode = 'P0001';
    end if;
    update public.profiles
    set display_name = v_display, login_name = v_login, household_id = v_current_id
    where id = v_user_id;
    return v_current_id;
  end if;

  select id into v_household_id
  from public.households
  where passphrase_hash = p_passphrase_hash
  for update;

  if v_household_id is null then
    -- 1人目: 新しく家計グループを作る
    insert into public.households (name, mode, owner_id, passphrase_hash)
    values (
      coalesce(nullif(trim(p_household_name), ''), 'わが家'),
      'personal',
      v_user_id,
      p_passphrase_hash
    )
    returning id into v_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_user_id, 'owner');

    perform public.seed_default_categories(v_household_id);
  else
    -- 2人目: 既存のグループに参加する
    select count(*) into v_member_count
    from public.household_members
    where household_id = v_household_id;

    if v_member_count >= 2 then
      raise exception 'PASSPHRASE_FULL' using errcode = 'P0001';
    end if;

    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_user_id, 'member');

    update public.households set mode = 'shared' where id = v_household_id;
  end if;

  insert into public.profiles (id, display_name, login_name, household_id)
  values (v_user_id, v_display, v_login, v_household_id)
  on conflict (id) do update
    set household_id = excluded.household_id,
        display_name = excluded.display_name,
        login_name = excluded.login_name;

  return v_household_id;
end;
$$;

-- 招待コードは廃止した（合言葉に統一）。以前の版から更新する場合のために削除しておく。
drop function if exists public.create_household(text, text, text);
drop function if exists public.create_invite(text, integer);
drop function if exists public.revoke_invite(uuid);
drop function if exists public.peek_invite(text);
drop function if exists public.accept_invite(text, boolean);

-- ---------------------------------------------------------------------------
-- 合言葉の変更
--   合言葉はログイン情報のもとにもなっているため、変更すると相手が入れなくなる。
--   そのため「1人のとき」だけ許可する（パートナー解除時は remove_partner から呼ぶ）。
-- ---------------------------------------------------------------------------
create or replace function public.set_passphrase(p_new_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if p_new_hash !~ '^[0-9a-f]{64}$' then
    raise exception '合言葉の形式が不正です' using errcode = '22023';
  end if;

  select household_id into v_household_id
  from public.household_members
  where user_id = v_user_id
  limit 1;

  if v_household_id is null then
    raise exception '家計グループが見つかりません' using errcode = 'P0002';
  end if;

  select count(*) into v_member_count
  from public.household_members
  where household_id = v_household_id;

  if v_member_count > 1 then
    raise exception '2人で使っている間は合言葉を変更できません' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.households
    where passphrase_hash = p_new_hash and id <> v_household_id
  ) then
    raise exception 'PASSPHRASE_TAKEN' using errcode = 'P0001';
  end if;

  update public.households set passphrase_hash = p_new_hash where id = v_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- パートナーの解除（相手をグループから外す）
--   共有データは残り、外された人は自分の新しいグループを作り直すことになる。
--   解除しただけでは相手が同じ合言葉で入り直せてしまうため、
--   新しい合言葉の指定を必須にしている。
-- ---------------------------------------------------------------------------
create or replace function public.remove_partner(p_user_id uuid, p_new_passphrase_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  if p_user_id = v_user_id then
    raise exception '自分自身は解除できません。退出をご利用ください' using errcode = 'P0001';
  end if;
  if p_new_passphrase_hash !~ '^[0-9a-f]{64}$' then
    raise exception '新しい合言葉を指定してください' using errcode = '22023';
  end if;

  select household_id into v_household_id
  from public.household_members
  where user_id = v_user_id
  limit 1;

  if v_household_id is null or not public.is_household_member(v_household_id) then
    raise exception '権限がありません' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.households
    where passphrase_hash = p_new_passphrase_hash and id <> v_household_id
  ) then
    raise exception 'PASSPHRASE_TAKEN' using errcode = 'P0001';
  end if;

  delete from public.household_members
  where household_id = v_household_id and user_id = p_user_id;

  update public.profiles set household_id = null where id = p_user_id;
  update public.households
  set mode = 'personal', passphrase_hash = p_new_passphrase_hash
  where id = v_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 家計グループからの退出
--   最後の1人が退出する場合は p_delete_data = true が必要（データごと削除される）。
-- ---------------------------------------------------------------------------
create or replace function public.leave_household(p_delete_data boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;

  select household_id into v_household_id
  from public.household_members
  where user_id = v_user_id
  limit 1;

  if v_household_id is null then
    return;
  end if;

  select count(*) into v_member_count
  from public.household_members
  where household_id = v_household_id;

  if v_member_count <= 1 and not p_delete_data then
    raise exception 'LAST_MEMBER' using errcode = 'P0001';
  end if;

  delete from public.household_members
  where household_id = v_household_id and user_id = v_user_id;

  update public.profiles set household_id = null where id = v_user_id;

  if v_member_count <= 1 then
    delete from public.households where id = v_household_id;
  else
    update public.households set mode = 'personal' where id = v_household_id;
    -- 残ったメンバーをオーナーにする
    update public.households h
    set owner_id = (
      select user_id from public.household_members where household_id = v_household_id limit 1
    )
    where h.id = v_household_id and h.owner_id = v_user_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- アカウント削除
--   共有グループに相手が残っている場合、共有データは残す（相手のデータを消さないため）。
--   1人だけの場合は家計グループごと削除する。
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;

  perform public.leave_household(true);
  delete from public.profiles where id = v_user_id;
  delete from auth.users where id = v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 前月の予算をコピーする
-- ---------------------------------------------------------------------------
create or replace function public.copy_budgets_from_previous_month(p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;

  select household_id into v_household_id
  from public.household_members
  where user_id = v_user_id
  limit 1;

  if v_household_id is null then
    raise exception '家計グループが見つかりません' using errcode = 'P0002';
  end if;

  insert into public.budgets (household_id, month, scope, user_id, category_id, amount_yen, created_by)
  select
    b.household_id,
    date_trunc('month', p_month)::date,
    b.scope,
    b.user_id,
    b.category_id,
    b.amount_yen,
    v_user_id
  from public.budgets b
  where b.household_id = v_household_id
    and b.month = (date_trunc('month', p_month) - interval '1 month')::date
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 実行権限（anon には渡さない。ログイン済みユーザーのみ）
revoke all on function public.join_or_create_household(text, text, text, text) from public;
revoke all on function public.set_passphrase(text) from public;
revoke all on function public.remove_partner(uuid, text) from public;
revoke all on function public.leave_household(boolean) from public;
revoke all on function public.delete_my_account() from public;
revoke all on function public.copy_budgets_from_previous_month(date) from public;
revoke all on function public.seed_default_categories(uuid) from public;

grant execute on function public.join_or_create_household(text, text, text, text) to authenticated;
grant execute on function public.set_passphrase(text) to authenticated;
grant execute on function public.remove_partner(uuid, text) to authenticated;
grant execute on function public.leave_household(boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.copy_budgets_from_previous_month(date) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.current_household_id() to authenticated;
